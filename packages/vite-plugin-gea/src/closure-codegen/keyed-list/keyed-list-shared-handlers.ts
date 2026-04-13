import type { BlockStatement, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { EmitContext } from '../emit/emit-context.ts'

export function isLowercaseJsxTagRoot(el: any): boolean {
  if (!t.isJSXElement(el)) return false
  const name = el.openingElement?.name
  if (!name || name.type !== 'JSXIdentifier') return false
  const first = name.name.charAt(0)
  return first >= 'a' && first <= 'z'
}

let __sharedHandlerCounter = 0

export function extractSharedHandlersFromBlock(
  block: BlockStatement,
  itemName: string,
  idxParam: any,
  outerStmts: Statement[],
  ctx: EmitContext,
): Map<string, string> {
  ctx.importsNeeded.add('GEA_DOM_ITEM')
  const idxName = t.isIdentifier(idxParam) ? idxParam.name : null
  for (const stmt of block.body) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const d of stmt.declarations) {
      if (!t.isIdentifier(d.id) || !d.init) continue
      if (!/^h\d+$/.test(d.id.name)) continue
      if (!t.isArrowFunctionExpression(d.init) && !t.isFunctionExpression(d.init)) continue
      const handlerFn = d.init as any
      const usesItem = referencesIdentifier(handlerFn.body, itemName)
      const usesIndex = !!idxName && referencesIdentifier(handlerFn.body, idxName)
      if (!usesItem && !usesIndex) continue
      const origParams = handlerFn.params ?? []
      if (origParams.length > 1) continue

      const sharedId = t.identifier('__hm_' + __sharedHandlerCounter++)
      const eParam = t.identifier('e')
      const nId = t.identifier('n')
      const symRead = t.memberExpression(nId, t.identifier('GEA_DOM_ITEM'), true)
      const walkTest = t.logicalExpression('&&', nId, t.binaryExpression('===', symRead, t.identifier('undefined')))
      const bodyStmts: Statement[] = [
        t.variableDeclaration('let', [t.variableDeclarator(nId, t.memberExpression(eParam, t.identifier('target')))]),
        t.whileStatement(
          walkTest,
          t.expressionStatement(t.assignmentExpression('=', nId, t.memberExpression(nId, t.identifier('parentNode')))),
        ),
        t.ifStatement(t.unaryExpression('!', nId), t.returnStatement()),
      ]
      if (usesItem) {
        bodyStmts.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(t.identifier(itemName), t.memberExpression(nId, t.identifier('GEA_DOM_ITEM'), true)),
          ]),
        )
      }
      if (usesIndex && idxName) {
        bodyStmts.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(idxName),
              t.callExpression(
                t.memberExpression(
                  t.memberExpression(
                    t.memberExpression(t.identifier('Array'), t.identifier('prototype')),
                    t.identifier('indexOf'),
                  ),
                  t.identifier('call'),
                ),
                [
                  t.memberExpression(t.memberExpression(nId, t.identifier('parentNode')), t.identifier('children')),
                  nId,
                ],
              ),
            ),
          ]),
        )
      }
      const origBody = handlerFn.body
      if (t.isBlockStatement(origBody)) {
        for (const s of origBody.body) bodyStmts.push(s)
      } else {
        bodyStmts.push(t.expressionStatement(origBody as any))
      }

      const sharedArrow = t.arrowFunctionExpression([eParam], t.blockStatement(bodyStmts))
      outerStmts.push(t.variableDeclaration('const', [t.variableDeclarator(sharedId, sharedArrow)]))
      ;(d as any).__sharedHandlerId = sharedId.name
      d.init = t.cloneNode(sharedId)
    }
  }

  const localToShared = collectSharedHandlerAliases(block)
  if (localToShared.size > 0) {
    rewriteSharedHandlerReferences(block, localToShared)
    dropSharedHandlerAliases(block, new Set(localToShared.keys()))
  }
  return localToShared
}

function referencesIdentifier(node: any, name: string): boolean {
  if (!node || typeof node !== 'object') return false
  if (node.type === 'Identifier' && node.name === name) return true
  if (
    (node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration' ||
      node.type === 'ArrowFunctionExpression') &&
    Array.isArray(node.params)
  ) {
    for (const p of node.params) {
      if (p && p.type === 'Identifier' && p.name === name) return false
    }
  }
  for (const key of Object.keys(node)) {
    if (isMetadataKey(key)) continue
    const v = node[key]
    if (Array.isArray(v)) {
      for (const c of v) if (referencesIdentifier(c, name)) return true
    } else if (v && typeof v === 'object' && typeof v.type === 'string') {
      if (referencesIdentifier(v, name)) return true
    }
  }
  return false
}

function collectSharedHandlerAliases(block: BlockStatement): Map<string, string> {
  const localToShared = new Map<string, string>()
  for (const stmt of block.body) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const d of stmt.declarations) {
      const sid = (d as any).__sharedHandlerId as string | undefined
      if (sid && t.isIdentifier(d.id)) localToShared.set(d.id.name, sid)
    }
  }
  return localToShared
}

function rewriteSharedHandlerReferences(block: BlockStatement, localToShared: Map<string, string>): void {
  const rewriteId = (node: any): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const c = node[i]
        if (c && t.isIdentifier(c) && localToShared.has(c.name)) node[i] = t.identifier(localToShared.get(c.name)!)
        else rewriteId(c)
      }
      return
    }
    if (t.isVariableDeclarator(node)) {
      rewriteValuePosition(node, 'init', localToShared, rewriteId)
      return
    }
    if (t.isMemberExpression(node)) {
      rewriteValuePosition(node, 'object', localToShared, rewriteId)
      if (node.computed) rewriteId(node.property)
      return
    }
    if (t.isObjectProperty(node)) {
      if (node.computed) rewriteValuePosition(node, 'key', localToShared, rewriteId)
      rewriteValuePosition(node, 'value', localToShared, rewriteId)
      return
    }
    for (const key of Object.keys(node)) {
      if (isMetadataKey(key)) continue
      const child = node[key]
      if (!child || typeof child !== 'object') continue
      if (t.isIdentifier(child) && localToShared.has(child.name))
        node[key] = t.identifier(localToShared.get(child.name)!)
      else rewriteId(child)
    }
  }
  for (const stmt of block.body) rewriteId(stmt)
}

function rewriteValuePosition(
  node: any,
  key: string,
  localToShared: Map<string, string>,
  recurse: (node: any) => void,
): void {
  const child = node[key]
  if (!child) return
  if (t.isIdentifier(child) && localToShared.has(child.name)) node[key] = t.identifier(localToShared.get(child.name)!)
  else recurse(child)
}

function dropSharedHandlerAliases(block: BlockStatement, dropDecls: Set<string>): void {
  block.body = block.body.filter((stmt) => {
    if (!t.isVariableDeclaration(stmt)) return true
    const kept = stmt.declarations.filter((d) => !(t.isIdentifier(d.id) && dropDecls.has(d.id.name)))
    if (kept.length === stmt.declarations.length) return true
    if (kept.length === 0) return false
    ;(stmt as any).declarations = kept
    return true
  })
}

function isMetadataKey(key: string): boolean {
  return (
    key === 'loc' ||
    key === 'start' ||
    key === 'end' ||
    key === 'range' ||
    key === 'type' ||
    key === 'leadingComments' ||
    key === 'trailingComments' ||
    key === 'innerComments' ||
    key === 'extra'
  )
}
