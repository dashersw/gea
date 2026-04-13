import type { Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { EmitContext } from '../emit/emit-context.ts'
import { compileJsxToBlock } from '../emit/emit-core.ts'
import { substituteBindings } from '../emit/emit-substitution.ts'
import {
  extractPatchRowFromBlock,
  extractSharedHandlersFromBlock,
  isLowercaseJsxTagRoot,
} from './keyed-list-patch-row.ts'
import {
  detectAndStripRelationalClass,
  injectRelationalClassIntoCreateItem,
  type RelationalClassMatch,
} from './relational-class.ts'

export interface KeyedListCreateItemOptions {
  cbBody: any
  itemParam: any
  idxParam: any
  ctx: EmitContext
  stmts: Statement[]
  substitutedKeyExpr: Expression | null
}

export interface KeyedListCreateItemResult {
  createItem: Expression
  patchRowExpr: Expression | null
  relMatches: RelationalClassMatch[]
  rowEventTypes: Set<string>
  rowFastEventTypes: Set<string>
  prevRowHandlers: EmitContext['_rowEventHandlers']
}

export function buildKeyedListCreateItem(options: KeyedListCreateItemOptions): KeyedListCreateItemResult {
  const { cbBody, itemParam, idxParam, ctx, stmts, substitutedKeyExpr } = options
  let createItem: Expression
  let patchRowExpr: Expression | null = null
  let relMatches: RelationalClassMatch[] = []
  const prevRowHandlers = ctx._rowEventHandlers
  const rowEventTypes = new Set<string>()
  const rowFastEventTypes = new Set<string>()

  if (cbBody && (t.isJSXElement(cbBody) || t.isJSXFragment(cbBody))) {
    relMatches = detectRelationalClasses(cbBody, itemParam, ctx)
    const prevInRow = ctx._inKeyedListRow
    const prevRowTypes = ctx._rowEventTypes
    const prevRowFastTypes = ctx._rowFastEventTypes
    ctx._inKeyedListRow = true
    ctx._rowEventTypes = rowEventTypes
    ctx._rowFastEventTypes = rowFastEventTypes
    ctx._rowEventHandlers = {}
    const block = compileJsxToBlock(cbBody, ctx)
    ctx._inKeyedListRow = prevInRow
    ctx._rowEventTypes = prevRowTypes
    ctx._rowFastEventTypes = prevRowFastTypes

    if (relMatches.length > 0) {
      markRelationalClassesUsingByKey(relMatches, substitutedKeyExpr, itemParam)
      injectRelationalClassIntoCreateItem(block, relMatches, itemParam)
    }

    const itemName = t.isIdentifier(itemParam) ? itemParam.name : null
    if (itemName) {
      patchRowExpr = extractPatchRowFromBlock(block, itemName, idxParam)
      if (patchRowExpr) ctx.importsNeeded.add('GEA_DIRTY_PROPS')
      const sharedHandlerMap = extractSharedHandlersFromBlock(block, itemName, idxParam, stmts, ctx)
      rewriteRowEventHandlers(ctx, sharedHandlerMap)
    }

    if (itemName && t.isJSXElement(cbBody) && isLowercaseJsxTagRoot(cbBody)) {
      inlineKeyedListRootStamps(block.body, itemName, ctx)
    }

    createItem = t.arrowFunctionExpression([itemParam, idxParam, t.identifier('d')], block)
  } else if (cbBody && (t.isConditionalExpression(cbBody) || t.isLogicalExpression(cbBody))) {
    createItem = buildConditionalCreateItem(cbBody, itemParam, idxParam, ctx)
  } else if (cbBody && t.isBlockStatement(cbBody)) {
    createItem = buildBlockCreateItem(cbBody, itemParam, idxParam, ctx)
  } else {
    createItem = t.arrowFunctionExpression([itemParam, idxParam, t.identifier('d')], cbBody ?? t.nullLiteral())
  }

  return { createItem, patchRowExpr, relMatches, rowEventTypes, rowFastEventTypes, prevRowHandlers }
}

function detectRelationalClasses(cbBody: any, itemParam: any, ctx: EmitContext): RelationalClassMatch[] {
  if (!cbBody || !t.isJSXElement(cbBody)) return []
  const itemName = t.isIdentifier(itemParam) ? itemParam.name : null
  return itemName ? detectAndStripRelationalClass(cbBody, itemName, ctx) : []
}

function markRelationalClassesUsingByKey(
  relMatches: RelationalClassMatch[],
  substitutedKeyExpr: Expression | null,
  itemParam: any,
): void {
  for (const m of relMatches) {
    if (
      substitutedKeyExpr &&
      t.isMemberExpression(substitutedKeyExpr) &&
      !substitutedKeyExpr.computed &&
      t.isIdentifier(substitutedKeyExpr.property, { name: m.itemKeyProp }) &&
      t.isIdentifier(substitutedKeyExpr.object) &&
      t.isIdentifier(itemParam) &&
      substitutedKeyExpr.object.name === itemParam.name
    ) {
      ;(m as any).useByKey = true
    }
  }
}

function rewriteRowEventHandlers(ctx: EmitContext, sharedHandlerMap: Map<string, string>): void {
  if (!ctx._rowEventHandlers) return
  for (const evType in ctx._rowEventHandlers) {
    const table = ctx._rowEventHandlers[evType]
    for (const [idx, name] of table) {
      const shared = sharedHandlerMap.get(name)
      if (shared) table.set(idx, shared)
    }
  }
}

function inlineKeyedListRootStamps(body: Statement[], itemName: string, ctx: EmitContext): void {
  const stampStmts: Statement[] = [
    t.expressionStatement(
      t.assignmentExpression(
        '=',
        t.memberExpression(t.identifier('root'), t.identifier('GEA_DOM_ITEM'), true),
        t.identifier(itemName),
      ),
    ),
  ]
  ctx.importsNeeded.add('GEA_DOM_ITEM')

  let rIdx = body.length
  for (let i = body.length - 1; i >= 0; i--) {
    if (t.isReturnStatement(body[i])) {
      rIdx = i
      break
    }
  }
  body.splice(rIdx, 0, ...stampStmts)
}

function buildConditionalCreateItem(cbBody: any, itemParam: any, idxParam: any, ctx: EmitContext): Expression {
  const bodyStmts: Statement[] = []
  let test: Expression
  let thenBranch: any
  let elseBranch: any
  if (t.isConditionalExpression(cbBody)) {
    test = substituteBindings(cbBody.test, ctx.bindings)
    thenBranch = cbBody.consequent
    elseBranch = cbBody.alternate
  } else {
    test = substituteBindings(cbBody.left, ctx.bindings)
    thenBranch = cbBody.right
    elseBranch = null
  }
  bodyStmts.push(
    t.ifStatement(
      test,
      t.blockStatement(compileBranch(thenBranch, ctx)),
      t.blockStatement(compileBranch(elseBranch, ctx)),
    ),
  )
  return t.arrowFunctionExpression([itemParam, idxParam, t.identifier('d')], t.blockStatement(bodyStmts))
}

function compileBranch(branch: any, ctx: EmitContext): Statement[] {
  if (!branch || t.isNullLiteral(branch) || t.isIdentifier(branch, { name: 'undefined' })) {
    return [
      t.returnStatement(
        t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createComment')), [
          t.stringLiteral(''),
        ]),
      ),
    ]
  }
  if (t.isJSXElement(branch) || t.isJSXFragment(branch)) return compileJsxToBlock(branch, ctx).body
  return [t.returnStatement(branch as Expression)]
}

function buildBlockCreateItem(cbBody: any, itemParam: any, idxParam: any, ctx: EmitContext): Expression {
  const precedingStmts: Statement[] = []
  let inlined = false
  for (const stmt of cbBody.body) {
    if (
      t.isReturnStatement(stmt) &&
      stmt.argument &&
      (t.isJSXElement(stmt.argument) || t.isJSXFragment(stmt.argument))
    ) {
      precedingStmts.push(...compileJsxToBlock(stmt.argument as any, ctx).body)
      inlined = true
      break
    }
    precedingStmts.push(stmt)
  }
  return t.arrowFunctionExpression(
    [itemParam, idxParam, t.identifier('d')],
    inlined ? t.blockStatement(precedingStmts) : cbBody,
  )
}
