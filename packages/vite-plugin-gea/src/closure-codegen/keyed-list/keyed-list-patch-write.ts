import type { Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { emitWalkExpr } from '../utils/dom-walk.ts'
import type { WalkKind } from './keyed-list-walks.ts'

type PatchKind = 'text' | 'attr' | 'value'

export type PatchWriteResult =
  | { kind: 'keep' }
  | { kind: 'drop' }
  | { kind: 'write'; patchStmt: Statement; initStmt: Statement; deadBindings: string[] }

export interface PatchWriteInput {
  kind: PatchKind
  args: any[]
  getterBody: any
  targetName: string
  walkName: string
  walk: number[]
  walkKinds?: WalkKind[]
  itemName: string
  nonDirectTextWalks: Set<string>
  stashSlots: Map<string, number>
}

export function buildPatchWrite(input: PatchWriteInput): PatchWriteResult {
  const itemPath = extractItemPath(input.getterBody, input.itemName)
  if (!itemPath || itemPath.length === 0) return { kind: 'keep' }

  if (input.kind === 'attr') {
    const attrName = input.args[3]
    if (!t.isStringLiteral(attrName)) return { kind: 'keep' }
    if ((attrName as any).value === 'key') return { kind: 'drop' }
  }

  const isDirectText = input.kind === 'text' && !input.nonDirectTextWalks.has(input.walkName)
  const canStash = input.walk.length > 0 && (input.kind !== 'text' || isDirectText)
  const slotN = canStash ? getStashSlot(input.stashSlots, input.walk) : null
  const elParam = t.identifier('el')
  const itemParam = t.identifier('item')
  const nodeExpr: Expression =
    slotN !== null
      ? t.memberExpression(elParam, t.identifier('__r' + slotN))
      : input.walk.length === 0
        ? elParam
        : emitWalkExpr(elParam, input.walk, input.walkKinds)
  const initNodeExpr: Expression =
    input.walk.length === 0 ? elParam : emitWalkExpr(elParam, input.walk, input.walkKinds)
  const itemAccess = buildItemAccess(itemParam, itemPath)
  const lazyCacheExpr: Expression =
    slotN !== null
      ? t.logicalExpression(
          '||',
          t.memberExpression(elParam, t.identifier('__r' + slotN)),
          t.assignmentExpression(
            '=',
            t.memberExpression(elParam, t.identifier('__r' + slotN)),
            emitWalkExpr(elParam, input.walk, input.walkKinds),
          ),
        )
      : nodeExpr

  const patchStmt = withDirtyPropGuard(
    buildPatchStatement(input.kind, input.args, lazyCacheExpr, itemAccess, itemPath),
    itemPath,
  )
  const initStmt = buildInitStatement(input.kind, input.args, initNodeExpr, itemPath)
  const deadBindings = input.kind === 'text' ? [input.targetName, input.walkName] : [input.targetName]
  return { kind: 'write', patchStmt, initStmt, deadBindings }
}

function getStashSlot(stashSlots: Map<string, number>, walk: number[]): number {
  const key = walk.join(',')
  const existing = stashSlots.get(key)
  if (existing !== undefined) return existing
  const slot = stashSlots.size
  stashSlots.set(key, slot)
  return slot
}

function buildPatchStatement(
  kind: PatchKind,
  args: any[],
  lazyCacheExpr: Expression,
  itemAccess: Expression,
  itemPath: string[],
): Statement {
  const n = t.identifier('__n')
  if (kind === 'text') {
    return t.blockStatement([
      t.variableDeclaration('const', [t.variableDeclarator(n, lazyCacheExpr)]),
      t.expressionStatement(
        t.assignmentExpression('=', t.memberExpression(n, t.identifier('nodeValue')), textValueExpression(itemAccess)),
      ),
    ])
  }
  if (kind === 'value') {
    return t.blockStatement([
      t.variableDeclaration('const', [t.variableDeclarator(n, lazyCacheExpr)]),
      t.expressionStatement(t.assignmentExpression('=', t.memberExpression(n, t.identifier('value')), itemAccess)),
    ])
  }
  return t.blockStatement([
    t.variableDeclaration('const', [t.variableDeclarator(n, lazyCacheExpr)]),
    t.expressionStatement(
      t.callExpression(t.memberExpression(n, t.identifier('setAttribute')), [
        args[3] as any,
        t.callExpression(t.identifier('String'), [buildItemAccess(t.identifier('item'), itemPath)]),
      ]),
    ),
  ])
}

function withDirtyPropGuard(stmt: Statement, itemPath: string[]): Statement {
  if (itemPath.length === 0) return stmt
  const dirtyProps = t.memberExpression(t.identifier('item'), t.identifier('GEA_DIRTY_PROPS'), true)
  const shouldPatch = t.logicalExpression(
    '||',
    t.unaryExpression('!', t.cloneNode(dirtyProps)),
    t.callExpression(t.memberExpression(t.cloneNode(dirtyProps), t.identifier('has')), [t.stringLiteral(itemPath[0])]),
  )
  return t.ifStatement(shouldPatch, t.isBlockStatement(stmt) ? stmt : t.blockStatement([stmt]))
}

function buildInitStatement(kind: PatchKind, args: any[], initNodeExpr: Expression, itemPath: string[]): Statement {
  const itemParam = t.identifier('item')
  if (kind === 'text') {
    const n = t.identifier('__n')
    return t.blockStatement([
      t.variableDeclaration('const', [t.variableDeclarator(n, initNodeExpr)]),
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(n, t.identifier('nodeValue')),
          textValueExpression(buildItemAccess(itemParam, itemPath)),
        ),
      ),
    ])
  }
  if (kind === 'value') {
    return t.blockStatement([
      t.expressionStatement(
        t.assignmentExpression(
          '=',
          t.memberExpression(initNodeExpr, t.identifier('value')),
          buildItemAccess(itemParam, itemPath),
        ),
      ),
    ])
  }
  return t.blockStatement([
    t.expressionStatement(
      t.callExpression(t.memberExpression(initNodeExpr, t.identifier('setAttribute')), [
        args[3] as any,
        t.callExpression(t.identifier('String'), [buildItemAccess(itemParam, itemPath)]),
      ]),
    ),
  ])
}

function textValueExpression(value: Expression): Expression {
  return t.templateLiteral(
    [t.templateElement({ raw: '', cooked: '' }, false), t.templateElement({ raw: '', cooked: '' }, true)],
    [t.logicalExpression('??', value, t.stringLiteral(''))],
  )
}

function buildItemAccess(base: any, itemPath: string[]): Expression {
  let e: any = base
  for (const p of itemPath) {
    e = /^\d+$/.test(p)
      ? t.memberExpression(e, t.numericLiteral(Number(p)), true)
      : t.memberExpression(e, t.identifier(p))
  }
  return e
}

function extractItemPath(expr: any, itemName: string): string[] | null {
  const parts: string[] = []
  let cur = expr
  while (t.isMemberExpression(cur)) {
    if (cur.computed) {
      if (!t.isStringLiteral(cur.property) && !t.isNumericLiteral(cur.property)) return null
      parts.unshift(String((cur.property as any).value))
    } else {
      if (!t.isIdentifier(cur.property)) return null
      parts.unshift(cur.property.name)
    }
    cur = cur.object
  }
  return t.isIdentifier(cur, { name: itemName }) ? parts : null
}
