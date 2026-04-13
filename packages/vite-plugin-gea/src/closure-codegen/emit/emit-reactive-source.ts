import { t } from '../../utils/babel-interop.ts'

import type { EmitContext } from './emit-context.ts'
import { containsJsx, lowerJsxInExpression } from './emit-jsx-lowering.ts'
import { getterPathOrGetter, tryExtractPathAndRoot, type PathOrGetter } from '../utils/path-helpers.ts'

/**
 * path-or-getter: static member chain → path array; else → `() => expr`.
 *
 * For fn components (reactiveRoot is `props`), paths against `props` don't
 * have a backing Store.observe, so ALWAYS emit the getter form — withTracking
 * then picks up the nested reads via trackRead on the parent store.
 */
export function expressionToPathOrGetter(
  expr: any,
  ctx?: EmitContext,
  opts?: { allowForeignRoot?: boolean },
): PathOrGetter {
  // Lower any nested JSX in the expression (e.g. `.map(x => <Item/>)` inside a
  // reactive-text getter) to closure-compiled block IIFEs. Without this, the
  // raw JSX would be emitted unchanged and fail to parse.
  if (ctx && containsJsx(expr)) {
    expr = lowerJsxInExpression(expr, ctx)
  }
  if (ctx && t.isIdentifier(ctx.reactiveRoot) && ctx.reactiveRoot.name === 'props') {
    return getterPathOrGetter(expr)
  }
  const info = tryExtractPathAndRoot(expr)
  if (info) {
    // Props-rooted paths (this.props.x.y) — materialized props is a plain getter
    // object, not a Store proxy. Use getter form so withTracking can pick up the
    // nested-proxy reads via trackRead.
    if (info.path[0] === 'props') {
      return getterPathOrGetter(expr)
    }
    // Path-form is only valid when the expression's root matches the active
    // reactive root (e.g. `this.x` when ctx.reactiveRoot is `this`). Otherwise
    // the runtime will resolve the path against the wrong object (e.g. loop
    // variables like `item` inside a keyed-list createItem). Fall back to getter.
    const rootIsThis = t.isThisExpression(info.root)
    const ctxRootIsThis = ctx ? t.isThisExpression(ctx.reactiveRoot) : true
    if (rootIsThis === ctxRootIsThis) {
      // `this.X` where X is a `get`-accessor on the class: force getter form
      // so withTracking picks up reads from foreign stores inside the getter
      // body. Path form would only subscribe to `this.X` which derived keys
      // don't reliably fire for.
      if (rootIsThis && ctx && ctx.classGetters.has(info.path[0])) {
        return getterPathOrGetter(expr)
      }
      return { kind: 'path', value: t.arrayExpression(info.path.map((p) => t.stringLiteral(p))) }
    }
    // Foreign root (e.g. module-level identifier `store.data`): callers that
    // pass `allowForeignRoot: true` (keyed-list) opt in to receiving the path
    // form PLUS the actual root expression so they can thread it into the
    // runtime subscribe call. Without this, keyed-list falls back to getter
    // form → withTracking → reconcile without change records → every list
    // mutation takes the general LIS path (6× slower on 06_remove-one-1k
    // because the remove fast path never fires).
    if (opts?.allowForeignRoot && t.isIdentifier(info.root)) {
      return { kind: 'path', value: t.arrayExpression(info.path.map((p) => t.stringLiteral(p))), root: info.root }
    }
    return getterPathOrGetter(expr)
  }
  return getterPathOrGetter(expr)
}
