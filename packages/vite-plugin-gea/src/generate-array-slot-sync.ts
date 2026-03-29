/**
 * Generate __itemProps_* method and constructor init for component array slots.
 * The runtime's __observeList() handles mount, refresh, and reconciliation.
 */
import * as t from '@babel/types'
import { id, jsMethod } from 'eszter'
import type { NodePath } from '@babel/traverse'
import type { UnresolvedMapInfo } from './ir.ts'
import { ITEM_IS_KEY } from './analyze-helpers.ts'
import { buildComponentPropsExpression, collectTemplateSetupStatements } from './transform-attributes.ts'
import type { TemplateSetupContext } from './transform-attributes.ts'
import { transformJSXExpression, transformJSXFragmentToTemplate } from './transform-jsx.ts'
import { getJSXTagName, isComponentTag, pruneUnusedSetupDestructuring } from './utils.ts'
import { replacePropRefsInExpression, replacePropRefsInStatements } from './utils.ts'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const traverse = require('@babel/traverse').default

export function isUnresolvedMapWithComponentChild(
  um: UnresolvedMapInfo,
  imports: Map<string, string>,
): { componentTag: string } | null {
  const template = um.itemTemplate
  if (!template) return null
  const root = t.isJSXElement(template) ? template : t.isJSXFragment(template) ? null : null
  if (!root || !t.isJSXElement(root)) return null
  const tagName = getJSXTagName(root.openingElement.name)
  if (!tagName || !isComponentTag(tagName) || !imports.has(tagName)) return null
  return { componentTag: tagName }
}

function getArrayCapName(arrayPropName: string): string {
  return arrayPropName.charAt(0).toUpperCase() + arrayPropName.slice(1)
}

export function getComponentArrayItemsName(arrayPropName: string): string {
  return `_${arrayPropName}Items`
}

export function getComponentArrayBuildMethodName(arrayPropName: string): string {
  return `_build${getArrayCapName(arrayPropName)}Items`
}

export function getComponentArrayRefreshMethodName(arrayPropName: string): string {
  return `__refresh${getArrayCapName(arrayPropName)}Items`
}

export function getComponentArrayMountMethodName(arrayPropName: string): string {
  return `__mount${getArrayCapName(arrayPropName)}Items`
}

export interface ComponentArrayResult {
  /** The __itemProps_* method */
  itemPropsMethod: t.ClassMethod
  /** Constructor init statement: this._todosItems = (store.todos ?? []).map(...) */
  constructorInit: t.Statement
  /** The component tag (constructor) name, e.g. 'TodoItem' */
  componentTag: string
  /** The container binding ID for __el() lookup (e.g. 'list') */
  containerBindingId?: string
  containerUserIdExpr?: t.Expression
  /** The item ID property name for keyed reconciliation (e.g. 'id') */
  itemIdProperty?: string
  /** The array access expression for the store path */
  arrAccessExpr: t.Expression
  /** Setup statements needed before accessing the array */
  arrSetupStatements: t.Statement[]
}

export function generateComponentArrayMethods(
  um: UnresolvedMapInfo,
  arrayPropName: string,
  imports: Map<string, string>,
  propNames: Set<string>,
  _classBody: t.ClassBody,
  storeArrayAccess?: { storeVar: string; propName: string },
  wholeParamName?: string,
  templateSetupContext?: TemplateSetupContext,
): t.ClassMethod[] {
  const result = generateComponentArrayResult(
    um,
    arrayPropName,
    imports,
    propNames,
    _classBody,
    storeArrayAccess,
    wholeParamName,
    templateSetupContext,
  )
  if (!result) return []
  return [result.itemPropsMethod]
}

export function generateComponentArrayResult(
  um: UnresolvedMapInfo,
  arrayPropName: string,
  imports: Map<string, string>,
  propNames: Set<string>,
  _classBody: t.ClassBody,
  storeArrayAccess?: { storeVar: string; propName: string },
  wholeParamName?: string,
  templateSetupContext?: TemplateSetupContext,
): ComponentArrayResult | null {
  const comp = isUnresolvedMapWithComponentChild(um, imports)
  if (!comp) return null

  const itemTemplate = um.itemTemplate
  if (!itemTemplate || !t.isJSXElement(itemTemplate)) return null

  const mapJsxCtx = {
    imports,
    componentInstances: new Map(),
    componentInstanceCursors: new Map(),
    inMapCallback: true,
    isRoot: false,
  }
  const transformExpr = (expr: t.Expression) => {
    const replaced = replacePropRefsInExpression(expr, propNames, wholeParamName)
    return transformJSXExpression(replaced, mapJsxCtx)
  }
  const transformFrag = (frag: t.JSXFragment) => transformJSXFragmentToTemplate(frag, mapJsxCtx)

  const propsResult = buildComponentPropsExpression(
    itemTemplate,
    imports,
    new Map(),
    undefined,
    undefined,
    templateSetupContext,
    transformExpr,
    transformFrag,
  )

  const propsExpr = propsResult.expression
  const itemVar = um.itemVariable
  const indexVar = um.indexVariable
  const needsRename = itemVar !== 'opt'
  const needsIndexRename = indexVar && indexVar !== '__k'
  let finalPropsExpr: t.ObjectExpression = propsExpr
  if (needsRename || needsIndexRename) {
    const cloned = t.cloneNode(propsExpr, true) as t.ObjectExpression
    traverse(cloned, {
      noScope: true,
      Identifier(path: NodePath<t.Identifier>) {
        if (needsRename && path.node.name === itemVar) {
          const parentNode = path.parentPath?.node
          if (parentNode && t.isObjectProperty(parentNode) && parentNode.key === path.node && !parentNode.computed) {
            return
          }
          path.node.name = 'opt'
          return
        }
        if (needsIndexRename && path.node.name === indexVar) {
          const parentNode = path.parentPath?.node
          if (parentNode && t.isObjectProperty(parentNode) && parentNode.key === path.node && !parentNode.computed) {
            return
          }
          path.node.name = '__k'
        }
      },
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (needsRename && t.isIdentifier(path.node.object) && path.node.object.name === itemVar) {
          path.node.object = t.identifier('opt')
        }
      },
    })
    finalPropsExpr = cloned
  }

  const itemsName = getComponentArrayItemsName(arrayPropName)

  let arrAccessExpr: t.Expression
  let arrSetupStatements: t.Statement[] = []
  if (storeArrayAccess) {
    arrAccessExpr = t.memberExpression(t.identifier(storeArrayAccess.storeVar), t.identifier(storeArrayAccess.propName))
  } else if (um.computationExpr) {
    arrSetupStatements = um.computationSetupStatements
      ? replacePropRefsInStatements(
          um.computationSetupStatements.map((stmt) => t.cloneNode(stmt, true) as t.Statement),
          propNames,
          wholeParamName,
        )
      : []
    arrAccessExpr = replacePropRefsInExpression(t.cloneNode(um.computationExpr, true), propNames, wholeParamName)
  } else {
    arrAccessExpr = t.memberExpression(
      t.memberExpression(t.thisExpression(), t.identifier('props')),
      t.identifier(arrayPropName),
    )
  }

  arrSetupStatements = pruneUnusedSetupDestructuring(arrSetupStatements, [arrAccessExpr, finalPropsExpr])

  const itemPropsMethodName = `__itemProps_${arrayPropName}`
  const itemPropsCallArgs: t.Expression[] = [t.identifier('opt')]
  if (indexVar) itemPropsCallArgs.push(t.identifier('__k'))
  const itemPropsCall = t.callExpression(
    t.memberExpression(t.thisExpression(), t.identifier(itemPropsMethodName)),
    itemPropsCallArgs,
  )

  const itemPropsSetup = collectTemplateSetupStatements(finalPropsExpr, templateSetupContext)

  // Inside __itemProps_* and __refresh*Items, store reads must bypass the proxy
  // to avoid re-entrant observation cycles (e.g. reading a computed getter that
  // depends on the array being iterated). Replace `storeVar` with `storeVar.__raw`
  // in setup destructuring statements.
  const storeVarNames = new Set<string>()
  if (storeArrayAccess) storeVarNames.add(storeArrayAccess.storeVar)
  for (const stmt of [...itemPropsSetup, ...arrSetupStatements]) {
    if (!t.isVariableDeclaration(stmt)) continue
    for (const decl of stmt.declarations) {
      if (t.isIdentifier(decl.init) && imports.has(decl.init.name)) {
        storeVarNames.add(decl.init.name)
      }
    }
  }
  const rewriteStoreDestructuring = (stmts: t.Statement[]) => {
    if (storeVarNames.size === 0) return
    for (const stmt of stmts) {
      if (!t.isVariableDeclaration(stmt)) continue
      for (const decl of stmt.declarations) {
        if (t.isIdentifier(decl.init) && storeVarNames.has(decl.init.name)) {
          decl.init = t.memberExpression(t.identifier(decl.init.name), t.identifier('__raw'))
        }
      }
    }
  }
  rewriteStoreDestructuring(itemPropsSetup)
  rewriteStoreDestructuring(arrSetupStatements)

  const itemPropsMethod = jsMethod`${id(itemPropsMethodName)}(opt) {}`
  if (indexVar) itemPropsMethod.params.push(t.identifier('__k'))
  itemPropsMethod.body.body.push(...itemPropsSetup, t.returnStatement(finalPropsExpr))

  const itemIdProp = um.itemIdProperty
  const keyExpr: t.Expression =
    itemIdProp && itemIdProp !== ITEM_IS_KEY
      ? t.callExpression(t.identifier('String'), [t.memberExpression(t.identifier('opt'), t.identifier(itemIdProp))])
      : itemIdProp === ITEM_IS_KEY
        ? t.callExpression(t.identifier('String'), [t.identifier('opt')])
        : t.binaryExpression('+', t.stringLiteral('__idx_'), t.identifier('__k'))

  // Constructor init: this._todosItems = (store.todos ?? []).map((opt, __k) => this.__child(Ctor, this.__itemProps_todos(opt), key))
  const mapParams: t.Identifier[] = [t.identifier('opt')]
  if (indexVar || !itemIdProp) mapParams.push(t.identifier('__k'))
  const childCall = t.callExpression(t.memberExpression(t.thisExpression(), t.identifier('__child')), [
    t.identifier(comp.componentTag),
    t.cloneNode(itemPropsCall, true),
    t.cloneNode(keyExpr, true),
  ])
  const mapCallback = t.arrowFunctionExpression(mapParams, childCall)
  const nullishCoalesce = t.logicalExpression('??', t.cloneNode(arrAccessExpr, true), t.arrayExpression([]))
  const parenthesized = t.parenthesizedExpression ? t.parenthesizedExpression(nullishCoalesce) : nullishCoalesce
  const mapCallExpr = t.callExpression(t.memberExpression(parenthesized, t.identifier('map')), [mapCallback])
  const constructorInit = t.expressionStatement(
    t.assignmentExpression('=', t.memberExpression(t.thisExpression(), t.identifier(itemsName)), mapCallExpr),
  )

  return {
    itemPropsMethod,
    constructorInit,
    componentTag: comp.componentTag,
    containerBindingId: um.containerBindingId,
    containerUserIdExpr: um.containerUserIdExpr,
    itemIdProperty: itemIdProp,
    arrAccessExpr,
    arrSetupStatements,
  }
}
