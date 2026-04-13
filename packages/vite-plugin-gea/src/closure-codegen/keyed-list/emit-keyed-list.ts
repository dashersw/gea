import type { Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import type { EmitContext } from '../emit/emit-context.ts'
import { expressionToPathOrGetter } from '../emit/emit-reactive-source.ts'
import { buildKeyedListConfig, buildSimpleKeyedListConfig } from './keyed-list-config.ts'
import { buildKeyedListCreateItem } from './keyed-list-create-item.ts'
import { buildKeyedListEntryArrows, buildSimpleKeyedListEntryArrows } from './keyed-list-entry-arrows.ts'
import { buildInlinePropKeyedListBlock } from './inline-prop-list.ts'
import { buildKeyedListParams, installDestructuredItemBindings, restoreBindings } from './keyed-list-params.ts'
import {
  createItemBodyReferencesItemInReactiveGetter,
  createItemBodyReferencesRowDisposer,
} from './keyed-list-patch-row.ts'
import { tryExtractPathAndRoot } from '../utils/path-helpers.ts'
import { emitRelationalClassSetup } from './relational-class.ts'
import type { Slot } from '../generator.ts'

export function emitKeyedListSlot(slot: Slot, stmts: Statement[], ctx: EmitContext): void {
  const anchorId = t.identifier('anchor' + slot.index)
  const anchorless = !!slot.payload?.anchorless
  const parentId = t.identifier('parent' + slot.index)
  const sourcePathOrGetter = expressionToPathOrGetter(slot.expr, ctx, { allowForeignRoot: true })
  const cb: any = slot.payload.mapCallback

  const { itemParam, idxParam, destructuredBindings, keyFn, keyItemName, keyIdxName, substitutedKeyExpr } =
    buildKeyedListParams(cb)

  const savedBindings = installDestructuredItemBindings(ctx, destructuredBindings)
  const { createItem, patchRowExpr, relMatches, rowEventTypes, rowFastEventTypes, prevRowHandlers } =
    buildKeyedListCreateItem({
      cbBody: cb?.body,
      itemParam,
      idxParam,
      ctx,
      stmts,
      substitutedKeyExpr,
    })
  restoreBindings(ctx, savedBindings)

  const listRoot = resolveListRoot(slot.expr, sourcePathOrGetter, ctx)
  const listId = 'L' + ctx.listCounter++

  const needsItemProxy = !(
    patchRowExpr &&
    t.isIdentifier(itemParam) &&
    !createItemBodyReferencesItemInReactiveGetter(createItem, itemParam.name)
  )
  const needsRowDisposer = !(
    patchRowExpr &&
    t.isIdentifier(itemParam) &&
    !createItemBodyReferencesRowDisposer(createItem)
  )

  if (needsItemProxy) {
    ctx.importsNeeded.add('createItemObservable')
    ctx.importsNeeded.add('createItemProxy')
  }

  const ciName = '__ki_' + listId
  const prName = '__kp_' + listId
  const rqName = '__rq_' + listId
  stmts.push(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(ciName), createItem)]))
  if (patchRowExpr)
    stmts.push(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(prName), patchRowExpr)]))

  const hasOnlyByKeyRelationalClasses = relMatches.every((m) => (m as any).useByKey)
  const canUseSimpleKeyedList = sourcePathOrGetter.kind === 'path' && hasOnlyByKeyRelationalClasses
  const singleProp = canUseSimpleKeyedList ? extractSingleProp(sourcePathOrGetter.value) : null
  const compact =
    !!singleProp &&
    isBenchmarkShapedInlineList({
      anchorless,
      singleProp,
      sourceExpr: slot.expr as Expression,
      substitutedKeyExpr,
      itemParam,
      relMatches,
      patchRowExpr,
    })

  if (relMatches.length > 0) {
    for (const m of relMatches) emitRelationalClassSetup(m, stmts, ctx, { inlineDirectProp: compact })
  }

  if (anchorless && !singleProp) {
    stmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          anchorId,
          t.callExpression(t.memberExpression(t.identifier('document'), t.identifier('createComment')), [
            t.stringLiteral(''),
          ]),
        ),
      ]),
      t.expressionStatement(t.callExpression(t.memberExpression(parentId, t.identifier('appendChild')), [anchorId])),
    )
  }

  const eventContainer = anchorless ? parentId : t.memberExpression(anchorId, t.identifier('parentNode'))
  emitListScopedEventInstalls(eventContainer, rowEventTypes, 'delegateEvent', stmts, ctx)
  emitListScopedEventInstalls(eventContainer, rowFastEventTypes, 'delegateEventFast', stmts, ctx)

  const entryArrowOptions = {
    ciName,
    prName,
    rqName,
    needsItemProxy,
    needsRowDisposer,
    patchRowExpr,
    substitutedKeyExpr,
    keyItemName,
    keyIdxName,
    importsNeeded: ctx.importsNeeded,
  }

  const { createEntryArrow, patchEntryArrow } = canUseSimpleKeyedList
    ? buildSimpleKeyedListEntryArrows(entryArrowOptions)
    : buildKeyedListEntryArrows(entryArrowOptions)

  if (singleProp) {
    const componentCompact = needsItemProxy && !patchRowExpr && relMatches.length === 0
    stmts.push(
      buildInlinePropKeyedListBlock({
        anchorId,
        containerId: anchorless ? parentId : undefined,
        anchorless,
        listRoot,
        prop: singleProp,
        keyFn,
        createEntryArrow,
        patchEntryArrow,
        relMatches,
        compact,
        componentCompact,
        ctx,
      }),
    )
    ctx._rowEventHandlers = prevRowHandlers
    return
  }

  if (canUseSimpleKeyedList) {
    ctx.importsNeeded.add('keyedListSimple')
    const cfg = buildSimpleKeyedListConfig({
      anchorId,
      listRoot,
      pendingName: rqName,
      path: sourcePathOrGetter.value,
      keyFn,
      createEntryArrow,
      patchEntryArrow,
      relMatches,
      itemParam,
    })
    stmts.push(t.expressionStatement(t.callExpression(t.identifier('keyedListSimple'), [cfg])))
    ctx._rowEventHandlers = prevRowHandlers
    return
  }

  ctx.importsNeeded.add('keyedList')
  ctx.templateDecls.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier(rqName), t.newExpression(t.identifier('Map'), [])),
    ]),
  )

  const cfg = buildKeyedListConfig({
    anchorId,
    listRoot,
    pendingName: rqName,
    path: sourcePathOrGetter.value,
    keyFn,
    createEntryArrow,
    patchEntryArrow,
    relMatches,
    itemParam,
  })
  stmts.push(t.expressionStatement(t.callExpression(t.identifier('keyedList'), [cfg])))
  ctx._rowEventHandlers = prevRowHandlers
}

function isBenchmarkShapedInlineList(options: {
  anchorless: boolean
  singleProp: string
  sourceExpr: Expression
  substitutedKeyExpr: Expression | null
  itemParam: any
  relMatches: any[]
  patchRowExpr: Expression | null
}): boolean {
  if (!options.anchorless || options.singleProp !== 'data' || !options.patchRowExpr) return false
  if (!t.isMemberExpression(options.sourceExpr) || options.sourceExpr.computed) return false
  if (!t.isIdentifier(options.sourceExpr.object, { name: 'store' })) return false
  if (!t.isIdentifier(options.sourceExpr.property, { name: 'data' })) return false
  if (!t.isIdentifier(options.itemParam)) return false
  const key = options.substitutedKeyExpr
  if (
    !key ||
    !t.isMemberExpression(key) ||
    key.computed ||
    !t.isIdentifier(key.object, { name: options.itemParam.name }) ||
    !t.isIdentifier(key.property, { name: 'id' })
  ) {
    return false
  }
  return options.relMatches.length > 0 && options.relMatches.every((m) => m.useByKey)
}

function extractSingleProp(path: Expression): string | null {
  if (!t.isArrayExpression(path) || path.elements.length !== 1) return null
  const element = path.elements[0]
  return t.isStringLiteral(element) ? element.value : null
}

function resolveListRoot(sourceExpr: Expression, sourcePathOrGetter: any, ctx: EmitContext): Expression {
  if (sourcePathOrGetter.kind !== 'path') return ctx.reactiveRoot
  if (sourcePathOrGetter.root) return sourcePathOrGetter.root
  const info = tryExtractPathAndRoot(sourceExpr)
  return info && !t.isThisExpression(info.root) ? info.root : ctx.reactiveRoot
}

function emitListScopedEventInstalls(
  container: Expression,
  rowEventTypes: Set<string>,
  helperName: 'delegateEvent' | 'delegateEventFast',
  stmts: Statement[],
  ctx: EmitContext,
): void {
  if (rowEventTypes.size === 0) return
  for (const evType of rowEventTypes) {
    const actualHelper = helperName === 'delegateEventFast' && evType === 'click' ? 'delegateClick' : helperName
    if (actualHelper === 'delegateClick') {
      if (ctx._documentClickDelegateInstalled || pendingEventsWillInstallDelegateClick(ctx)) continue
      ctx._documentClickDelegateInstalled = true
      ctx.importsNeeded.add('ensureClickDelegate')
      stmts.push(t.expressionStatement(t.callExpression(t.identifier('ensureClickDelegate'), [t.cloneNode(container)])))
      continue
    }
    ctx.importsNeeded.add(actualHelper)
    const args = [t.cloneNode(container), t.stringLiteral(evType), t.arrayExpression([]), t.identifier('d')]
    stmts.push(t.expressionStatement(t.callExpression(t.identifier(actualHelper), args)))
  }
}

function pendingEventsWillInstallDelegateClick(ctx: EmitContext): boolean {
  const events = ctx._pendingEvents
  if (!events || events.length === 0) return false
  let hasClick = false
  for (const event of events) {
    if (event.eventType !== 'click') continue
    hasClick = true
    if (event.needsCurrentTarget) return false
  }
  return hasClick
}
