import type { BlockStatement, Expression, Statement } from '@babel/types'

import { t } from '../../utils/babel-interop.ts'

import { emitWalkExpr } from '../utils/dom-walk.ts'
import type { EmitContext } from './emit-context.ts'
import { emitSlot } from './emit-slot.ts'
import { emitTemplateCloneExpression, emitTemplateDecl } from './template-decl.ts'
import { normalizeEventAttrName, walkJsxToTemplate, type Slot, type TemplateSpec } from '../generator.ts'
import { templateSpecToIr } from '../ir.ts'

export function compileJsxToBlock(jsxRoot: any, ctx: EmitContext): BlockStatement {
  // Wrap the JSX root in a `<span style="display:contents">` when it would
  // produce a non-singular cloneable root:
  //   - JSXFragment with multiple top-level children — first would be lost
  //   - html starting with `<!--` (only a mount/conditional anchor) — comment
  //     isn't an Element
  //   - html not starting with `<` (bare text) — can't clone
  // We always wrap fragments since detecting "multiple top-level elements" in
  // the flat html string is lossy once we've emitted.
  const spec = walkJsxToTemplate(jsxRoot, {
    emitEventDataAttr: false,
    directFnComponents: ctx.directFnComponents,
    bindings: ctx.bindings,
  })
  const isFragment = t.isJSXFragment(jsxRoot)
  // Two kinds of wrap:
  //  (a) Single non-element root (just `<!--0-->`): walks were relative to the
  //      missing element; after wrap they need +[0] to descend into the span.
  //  (b) Fragment root: walks are ALREADY relative to the fragment's children,
  //      which become the span's children. No shift needed.
  if (isFragment) {
    spec.html = '<span style="display:contents">' + spec.html + '</span>'
  } else if (!spec.html.startsWith('<') || spec.html.startsWith('<!--')) {
    spec.html = '<span style="display:contents">' + spec.html + '</span>'
    for (const slot of spec.slots) slot.walk = [0, ...slot.walk]
  }
  if (ctx.irTemplates && ctx.currentIrComponent && ctx.currentIrRuntimeBase) {
    ctx.irTemplates.push({
      component: ctx.currentIrComponent,
      runtimeBase: ctx.currentIrRuntimeBase,
      template: templateSpecToIr(spec),
    })
  }
  const tplName = '_tpl' + ctx.tplCounter++
  ctx.templateDecls.push(...emitTemplateDecl(spec.html, tplName))

  const stmts: Statement[] = []
  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier('root'), emitTemplateCloneExpression(tplName, spec.html)),
    ]),
  )
  // ── Phase 1: hoist ALL walk captures (anchor/marker/el/evt vars) ──
  // This must happen BEFORE any slot action runs because slot actions (keyedList,
  // conditional, mount) mutate the parent's childNodes list and would shift
  // literal-index walks for subsequent slots.
  const walkCache = new Map<string, string>()
  for (const slot of spec.slots) emitWalkCapture(slot, stmts, false, walkCache)
  // Start each compileJsxToBlock with a fresh pending-events bucket so
  // nested templates don't leak events into the parent's delegateEvent calls.
  const savedPending = ctx._pendingEvents
  const savedInputValueExprByEventSlot = ctx._inputValueExprByEventSlot
  const savedDocumentClickDelegateInstalled = ctx._documentClickDelegateInstalled
  ctx._pendingEvents = []
  ctx._inputValueExprByEventSlot = findInputValueReconciliations(spec)
  ctx._documentClickDelegateInstalled = false
  // ── Phase 2: emit slot wiring using hoisted captures ──
  for (const slot of spec.slots) emitSlot(slot, stmts, ctx)
  // ── Phase 3: group event slots by eventType. Keyed-list rows emit
  // inline `evtN.__on_<type> = hN` writes in createItem and one
  // `delegateEvent(container, type, [], d)` install at list scope.
  // Non-keyed-list sites emit a single `delegateEvent(root, type, pairs, d)`.
  const events = ctx._pendingEvents
  ctx._pendingEvents = savedPending
  ctx._inputValueExprByEventSlot = savedInputValueExprByEventSlot
  if (events.length > 0) {
    const groups = new Map<string, typeof events>()
    for (const e of events) {
      const arr = groups.get(e.eventType)
      if (arr) arr.push(e)
      else groups.set(e.eventType, [e])
    }
    for (const [eventType, eventSlots] of groups) {
      const canUseFastDelegate = eventSlots.every((event) => !event.needsCurrentTarget)
      if (ctx._inKeyedListRow) {
        // Inline `evtN.__on_<type> = hN` writes per row. One install call at
        // list scope handles document listener registration — see
        // `emitKeyedListSlot` below.
        for (const event of eventSlots) {
          const k =
            canUseFastDelegate && eventType === 'click'
              ? '__gc'
              : (event.needsCurrentTarget ? '__onct_' : '__on_') + eventType
          const handler = event.handler ? t.cloneNode(event.handler) : t.identifier('h' + event.slotIndex)
          stmts.push(
            t.expressionStatement(
              t.assignmentExpression(
                '=',
                t.memberExpression(t.identifier('evt' + event.slotIndex), t.identifier(k)),
                handler,
              ),
            ),
          )
        }
        if (canUseFastDelegate && eventType === 'click') ctx._rowFastEventTypes!.add(eventType)
        else ctx._rowEventTypes!.add(eventType)
      } else {
        const pairs = eventSlots.map((event) => {
          const handler = event.handler ? t.cloneNode(event.handler) : t.identifier('h' + event.slotIndex)
          const pair: Expression[] = [t.identifier('evt' + event.slotIndex), handler]
          if (!event.needsCurrentTarget) pair.push(t.booleanLiteral(false))
          return t.arrayExpression(pair)
        })
        const helperName = canUseFastDelegate
          ? eventType === 'click'
            ? 'delegateClick'
            : 'delegateEvent'
          : 'delegateEvent'
        ctx.importsNeeded.add(helperName)
        const args =
          helperName === 'delegateClick'
            ? [t.identifier('root'), t.arrayExpression(pairs)]
            : [t.identifier('root'), t.stringLiteral(eventType), t.arrayExpression(pairs), t.identifier('d')]
        stmts.push(t.expressionStatement(t.callExpression(t.identifier(helperName), args)))
        if (helperName === 'delegateClick') ctx._documentClickDelegateInstalled = true
      }
    }
  }
  ctx._documentClickDelegateInstalled = savedDocumentClickDelegateInstalled
  stmts.push(t.returnStatement(t.identifier('root')))
  return t.blockStatement(stmts)
}

export function findInputValueReconciliations(spec: TemplateSpec): Map<number, any> {
  const valueExprByWalk = new Map<string, any>()
  for (const slot of spec.slots) {
    if (slot.kind === 'value') valueExprByWalk.set(JSON.stringify(slot.walk), slot.expr)
  }
  const out = new Map<number, any>()
  if (valueExprByWalk.size === 0) return out
  for (const slot of spec.slots) {
    if (slot.kind !== 'event') continue
    if (normalizeEventAttrName(slot.payload.attrName) !== 'input') continue
    const valueExpr = valueExprByWalk.get(JSON.stringify(slot.walk))
    if (valueExpr) out.set(slot.index, valueExpr)
  }
  return out
}

/**
 * Emit JUST the DOM-walk variable for a slot — no action wiring. Called in a
 * first pass so every walk is captured before subsequent slots mutate the DOM.
 * The variable name matches what emitSlot expects later.
 */
export function emitWalkCapture(
  slot: Slot,
  stmts: Statement[],
  skipEventWalks = false,
  walkCache?: Map<string, string>,
): void {
  // Skip event-walk decls when the container-scoped dispatcher is active —
  // nothing reads `evtN` if per-row `el.__on_type = handler` writes are
  // eliminated. DCE would prune them later but it's cleaner to not emit in
  // the first place.
  if (skipEventWalks && slot.kind === 'event') return
  let name: string
  if (slot.kind === 'text') name = 'marker' + slot.index
  else if (slot.kind === 'event') name = 'evt' + slot.index
  else if (
    slot.kind === 'attr' ||
    slot.kind === 'bool' ||
    slot.kind === 'class' ||
    slot.kind === 'style' ||
    slot.kind === 'value' ||
    slot.kind === 'ref' ||
    slot.kind === 'html'
  )
    name = 'el' + slot.index
  else if (slot.kind === 'direct-fn' && slot.payload?.appendOnly) {
    if (slot.payload.appendOnly.position !== 0) return
    name = 'parent' + slot.payload.appendOnly.groupId
    const key = walkCacheKey(slot.payload.appendOnly.parentWalk, slot.payload.appendOnly.parentWalkKinds)
    const existing = walkCache?.get(key)
    if (existing) {
      emitWalkAlias(name, existing, stmts)
      return
    }
    stmts.push(
      t.variableDeclaration('const', [
        t.variableDeclarator(
          t.identifier(name),
          emitWalkExpr(
            t.identifier('root'),
            slot.payload.appendOnly.parentWalk,
            slot.payload.appendOnly.parentWalkKinds,
          ),
        ),
      ]),
    )
    walkCache?.set(key, name)
    return
  } else if (slot.kind === 'keyed-list' && slot.payload?.anchorless) name = 'parent' + slot.index
  else if (
    slot.kind === 'mount' ||
    slot.kind === 'direct-fn' ||
    slot.kind === 'conditional' ||
    slot.kind === 'keyed-list'
  )
    name = 'anchor' + slot.index
  else return
  const walk = slot.payload?.anchorless?.parentWalk ?? slot.walk
  const walkKinds = slot.payload?.anchorless?.parentWalkKinds ?? slot.walkKinds
  const key = walkCacheKey(walk, walkKinds)
  const existing = walkCache?.get(key)
  if (existing) {
    emitWalkAlias(name, existing, stmts)
    return
  }
  stmts.push(
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier(name), emitWalkExpr(t.identifier('root'), walk, walkKinds)),
    ]),
  )
  walkCache?.set(key, name)
}

function walkCacheKey(walk: number[], walkKinds?: unknown[]): string {
  return JSON.stringify([walk, walkKinds ?? null])
}

function emitWalkAlias(name: string, existing: string, stmts: Statement[]): void {
  stmts.push(t.variableDeclaration('const', [t.variableDeclarator(t.identifier(name), t.identifier(existing))]))
}
