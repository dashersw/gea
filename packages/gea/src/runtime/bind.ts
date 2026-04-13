/**
 * bind(disposer, root, pathOrGetter, apply) — single wire-up primitive for
 * every reactive-* helper. All the reactive-attr/bool/class/style/value/text
 * wrappers share this shape: compute the value, write it via `apply`, and
 * re-run on source change.
 *
 * - Static path (string[]): `readPath` + `subscribe`, closure tracks prev.
 * - Dynamic getter (() => unknown): `withTracking` scope re-runs on any
 *   tracked-path change.
 *
 * (Keep per-binding withTracking: batching into one effect per row WOULD
 * reduce allocation overhead on 01_run1k / 09_clear1k but triggers every
 * binding in the row on every fire, regressing 04_select1k catastrophically
 * when one store key change cascades through N applies that didn't actually
 * depend on it. Per-dep subscription is the right granularity for updates.)
 */

import type { Disposer } from './disposer'
import { readPath, subscribe } from './subscribe'
import { withTracking } from './with-tracking'

export function bind(
  disposer: Disposer,
  root: any,
  pathOrGetter: readonly string[] | (() => unknown),
  apply: (v: unknown) => void,
): void {
  if (Array.isArray(pathOrGetter)) {
    apply(readPath(root, pathOrGetter))
    const off = subscribe(root, pathOrGetter, apply)
    disposer.add(off)
    return
  }
  const getter = pathOrGetter as () => unknown
  withTracking(disposer, root, () => {
    apply(getter())
  })
}
