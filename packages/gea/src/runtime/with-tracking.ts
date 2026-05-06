/**
 * withTracking(disposer, root, fn) — lexical reactivity scope.
 *
 * Tracks (storeRoot, prop) tuples so the effect can subscribe on the real
 * store that owns each accessed property — not the `root` param (which for
 * fn components is a props-thunks proxy with no observe()).
 *
 * Scope is strictly lexical: `_active` is null outside of withTracking; store
 * proxy traps are a no-op in that case (zero ambient cost).
 *
 * Perf path: after 2 consecutive runs produce the SAME dep set, the effect
 * enters "locked" mode and subsequent re-runs skip the scope/tracking
 * entirely — `run` becomes a bare `fn()` call. Most reactive bindings in
 * keyed-list rows (e.g. `store.selected === item.id ? 'danger' : ''`)
 * read a fixed (store, item) pair every time, so this is the common case.
 * The 1000-effect fire on 04_select1k drops from "1000 scope allocations +
 * 1000 dep comparisons" to "1000 plain function calls".
 */

import type { Disposer } from './disposer'
import { subscribe } from './subscribe'

interface Dep {
  root: any
  prop: string
}
interface Scope {
  deps: Dep[]
}
let _active: Scope | null = null
let _recursing = false

/** Record a tracking read. Called by store.ts proxy traps. */
export function trackRead(storeRoot: any, prop: string | symbol): void {
  if (!_active || _recursing) return
  if (typeof prop !== 'string') return
  _recursing = true
  try {
    // Linear dedup — 1-3 deps is typical per binding, a Map is overkill.
    const deps = _active.deps
    for (let i = 0; i < deps.length; i++) {
      if (deps[i].root === storeRoot && deps[i].prop === prop) return
    }
    deps.push({ root: storeRoot, prop })
  } finally {
    _recursing = false
  }
}

/** Test helper — no-op; real Store reads fire trackRead through the proxy. */
export function trackPath(_path: readonly string[]): void {
  /* no-op */
}

/** Suppress tracking for `fn`. */
export function untrack<T>(fn: () => T): T {
  const prev = _active
  _active = null
  try {
    return fn()
  } finally {
    _active = prev
  }
}

function _depsEqual(a: Dep[], b: Dep[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].root !== b[i].root || a[i].prop !== b[i].prop) return false
  }
  return true
}

export function withTracking(disposer: Disposer, root: any, fn: () => void, staticDeps = false): void {
  let offs: Array<() => void> = []
  let prevDeps: Dep[] = []
  // Reused across the 2 pre-lock runs — saves a Scope + deps array alloc
  // each fire on 01_run1k / 07_create10k (6000 allocs for 1000 rows × 3
  // bindings × 2 runs).
  const scope: Scope = { deps: [] }
  // Stability counter: 0 = first run; 1 = one identical run; 2 = locked.
  // Locked effects skip tracking on every subsequent fire (same idea as the
  // compiled patcher's fast path). Require 2 identical runs before locking so
  // conditional-dep bindings (e.g. `x && x.y`) get a chance to register
  // their full dep set before the fast path engages.
  let stable = 0
  const run = (): void => {
    if (stable >= 2) {
      fn()
      return
    }
    const prev = _active
    scope.deps = []
    _active = scope
    try {
      fn()
    } finally {
      _active = prev
      const d2 = scope.deps
      if (_depsEqual(d2, prevDeps)) {
        stable = staticDeps ? 2 : stable + 1
      } else {
        stable = staticDeps ? 2 : 0
        for (let i = 0; i < offs.length; i++) offs[i]()
        offs = []
        for (let i = 0; i < d2.length; i++) {
          const d = d2[i]
          offs.push(subscribe(d.root ?? root, [d.prop], run))
        }
        prevDeps = d2
      }
    }
  }
  run()
  disposer.add(() => {
    for (let i = 0; i < offs.length; i++) offs[i]()
    offs = []
  })
}
