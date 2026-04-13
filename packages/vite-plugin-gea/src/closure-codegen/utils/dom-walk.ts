import type { Expression } from '@babel/types'
import { t } from '../../utils/babel-interop.ts'

/**
 * Emit DOM-walk expression. Two modes:
 *
 *   1. No walkKinds (fallback): `root.childNodes[a].childNodes[b]...`
 *      — safe for any DOM structure but slower in V8 (childNodes returns a
 *      live NodeList; [N] is indexed access with bounds check on every call).
 *
 *   2. With walkKinds (per-step element-aware): emit
 *      `root.firstElementChild.nextElementSibling.firstElementChild...` for
 *      `{elem: N}` steps (skips non-element siblings at the V8 level —
 *      direct pointer deref) and `.firstChild` for `{child: 0}` (first-child
 *      CharacterData fast path — v3's `f.firstChild.data = …` pattern). For
 *      `{child: N}` with N > 0 (sibling-text among siblings), falls back to
 *      `childNodes[N]`.
 *
 * Prefer the element-chain walk (`firstElementChild` / `nextElementSibling`)
 * over repeated `childNodes[n]` where the template shape allows it — fewer
 * live NodeList touches and cheaper indexing in V8.
 */
export function emitWalkExpr(
  root: Expression,
  walk: number[],
  walkKinds?: Array<{ elem: number } | { child: number }>,
): Expression {
  let out: Expression = root
  // Gate element-chain emission conservatively:
  //   - All steps must be {elem: N} (pure element-chain walk), OR
  //   - All prior steps are {elem: N} and only the FINAL step is {child: 0}
  //     (element descent ending at the single text/comment child).
  //
  // Anything else (mixed childNodes indexing mid-walk) falls back to
  // childNodes[n] for all steps, which is still correct — just slower.
  //
  // Why this gate: a prior attempt emitted `.firstChild` / firstElementChild
  // chains unconditionally and caused a saas-dashboard-jsdom OOM. The safe
  // subset here covers the js-framework-benchmark hot path (row templates
  // where every descent is through element children) while leaving mixed-
  // child trees (like Tabs' items.map with Node-valued content slots) on
  // the proven childNodes path until the interaction is isolated.
  // Element-chain walks DISABLED pending deeper investigation of a
  // saas-dashboard-jsdom OOM regression specific to 3+-step element chains.
  // Other fast-version benefits (textContent, shared events, byKey-based
  // relational class) are higher impact per row than the element-chain
  // speedup and don't require this infrastructure; prioritizing those.
  const canUseElemChain = false
  if (!canUseElemChain) {
    for (const i of walk) {
      // `.firstChild` is a direct reference-returning getter; `.childNodes[0]`
      // also works but V8 sometimes materializes the live NodeList object.
      // Benchmark-shaped templates have many childNodes[0] steps (first child
      // of td, first child of a, etc.) — ~7 per row × 1k rows on 01/07.
      // Using `firstChild` saves ~50ns per step → ~350μs per 1k rows script.
      if (i === 0) {
        out = t.memberExpression(out, t.identifier('firstChild'))
      } else {
        out = t.memberExpression(t.memberExpression(out, t.identifier('childNodes')), t.numericLiteral(i), true)
      }
    }
    return out
  }
  for (const k of walkKinds!) {
    if ('elem' in k) {
      out = t.memberExpression(out, t.identifier('firstElementChild'))
      for (let i = 0; i < k.elem; i++) {
        out = t.memberExpression(out, t.identifier('nextElementSibling'))
      }
    } else {
      out = t.memberExpression(out, t.identifier('firstChild'))
    }
  }
  return out
}
