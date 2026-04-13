/**
 * relationalClass — keyed-list optimization for the pattern
 *   class={storeExpr === item.key ? 'cls' : ''}
 *
 * Without this, each of N rows installs its own per-row `reactiveClass` effect
 * that re-evaluates the ternary on every `storeExpr` change — O(N) DOM reads +
 * observer fires on a single selection change (04_select1k hotspot).
 *
 * With this: one subscribe at the list level tracks `storeExpr`. Each row
 * registers its root element in a shared map keyed by `item.key`. On change,
 * we look up the previously-selected row and the newly-selected row in the
 * map and toggle one class on each — two DOM ops, no per-row observers.
 *
 * The compiler emits the registration, initial-class application, and the
 * list-level subscribe directly; this helper just packages the subscribe +
 * toggle logic to save bundle bytes.
 */

import type { Disposer } from './disposer'
import { GEA_OBSERVE_DIRECT } from './internal-symbols'
import { subscribe } from './subscribe'

/**
 * `map` can be:
 *   - `Record<string, Element>` (compiler emits `map[item.key] = root`
 *     per row at createItem time + `onRemove: (item) => delete map[item.key]`
 *     to clean up).
 *   - `(key: any) => Element | undefined` lookup function. Used when the
 *     compiler proves `storeExpr`'s value type matches the keyedList's key —
 *     then the keyedList's existing `byKey` Map is reused via this function
 *     with NO per-row map write and NO onRemove cleanup. Saves:
 *       - ~50ns × N rows on create (no `map[item.key] = root` write)
 *       - ~500ns × N rows on bulk clear (no `onRemove` iteration — the
 *         keyedList skips the `onRemove` loop entirely when not supplied)
 *     On bulk clears, avoiding per-row map writes and onRemove iteration
 *     removes noticeable overhead vs. maintaining a separate row map.
 */
export function relationalClass(
  d: Disposer,
  root: any,
  path: readonly string[],
  map: Record<string, Element> | ((key: any) => Element | undefined),
  cls: string,
  initial: unknown,
): void {
  const lookup: (k: any) => Element | undefined =
    typeof map === 'function' ? (map as any) : (k) => (map as Record<string, Element>)[k]
  let prev: any = initial
  // Use `className=` instead of classList.remove/add: the compiler-stripped
  // class attribute guarantees this element has no other class source
  // (detectAndStripRelationalClass only fires when the whole `class={...}`
  // is a single ternary), so assigning `cls` or '' is equivalent to toggling.
  // `className=` is a single string store; classList does tokenization +
  // mutation records. Closes ~100μs on 04_select1k vs classList toggle.
  const flip = (val: unknown): void => {
    if (val === prev) return
    const p = lookup(prev)
    if (p) (p as any).className = ''
    const n = lookup(val)
    if (n) (n as any).className = cls
    prev = val
  }
  // Try the internal sync-direct observer when the path is a single root
  // prop and the root exposes it — matches signal-dispatch latency (no
  // microtask, no change-record alloc). Falls back to the standard
  // batched subscribe otherwise (multi-segment paths, custom observe
  // shims). `relationalClass` only touches DOM classes; safe for sync.
  const observeDirect = root?.[GEA_OBSERVE_DIRECT]
  if (path.length === 1 && typeof observeDirect === 'function') {
    const off = observeDirect.call(root, path[0], flip) as () => void
    d.add(off)
    return
  }
  const off = subscribe(root, path, (val: unknown) => flip(val))
  d.add(off)
}
