/**
 * subscribe(root, path, fn) — path-indexed subscription helper for the
 * closure-compiled runtime.
 *
 * Delegates to the existing `Store.prototype.observe(path, handler)` API —
 * which already handles path-indexed buckets (`priv.observers`) and resolves
 * the tail on fire. That means `subscribe` does NOT need to extend store.ts
 * with a new registration entry point; the observer-bucket machinery already
 * handles the single-root-prop + tail-resolve case.
 *
 * `root` may be a Store proxy, a raw Store, or any object that exposes an
 * `observe(path, fn)` method (SSR shim uses the same signature).
 */

import type { Store, Change } from '../store'

type PathInput = readonly string[]

export function subscribe(root: any, path: PathInput, fn: (v: any, changes?: Change[]) => void): () => void {
  if (!root) return () => {}
  // Walk path prefixes: if the current root resolves `path[0]` to a nested Store
  // (has its own `.observe`), descend into it. This lets the compiler emit
  // `['store', 'count']` against `this` and have the subscription land on
  // `this.store` (the actual Store proxy) with tail `['count']`.
  let r: any = root
  let p: PathInput = path
  while (p.length > 1) {
    const head = p[0]
    const next = r?.[head]
    if (!next || typeof next.observe !== 'function') break
    r = next
    p = p.slice(1)
  }
  // If the final root doesn't have .observe, we can't subscribe — emit noop.
  if (!r || typeof r.observe !== 'function') return () => {}
  // Empty path → fire on any change (root-observer semantics in Store.observe).
  if (p.length === 0) return (r as Store).observe('', fn as any)
  // Pass `fn` directly as the observer — the trampoline `(v, changes) => fn(...)`
  // was a no-op hop that allocated one closure per subscribe (5k closures for
  // a 1000-row 5-binding list). Drop it.
  return (r as Store).observe(p, fn as any)
}

/** Resolve a path against the root proxy; returns `undefined` on null holes. */
export function readPath(root: any, path: readonly string[]): unknown {
  if (!root) return undefined
  let v: any = root
  for (let i = 0; i < path.length; i++) {
    if (v == null) return undefined
    v = v[path[i]]
  }
  return v
}
