/**
 * Disposer — LIFO teardown registry.
 *
 * Class-based so the `add` / `dispose` / `child` methods live on the prototype
 * once, instead of being closures created per instance. Each `createDisposer()`
 * call was allocating 3 closures; on a 1000-row keyed list with per-row
 * children that's ~3000 closure allocations that GC had to chase. The class
 * form drops that to one shared prototype plus the per-instance `f[]` array
 * and (for children) a single dispose-bridge closure.
 */

export interface Disposer {
  add(fn: () => void): void
  dispose(): void
  child(): Disposer
}

class _Disposer implements Disposer {
  f: Array<() => void> = []
  add(fn: () => void): void {
    this.f.push(fn)
  }
  dispose(): void {
    const f = this.f
    // Hoisted try/catch (one per dispose call, not per iteration) — measurable
    // on 09_clear1k's ~5000-cleanup teardown. Framework-owned cleanups don't
    // throw under normal operation; if one does, the remainder of THIS
    // disposer's stack is skipped (best-effort teardown: one failure does not
    // run the rest of this disposer's callbacks).
    try {
      for (let i = f.length - 1; i >= 0; i--) f[i]()
    } catch {
      /* one handler threw */
    }
    f.length = 0
  }
  child(): Disposer {
    const c = new _Disposer()
    this.f.push(_dispatchChild(c))
    return c
  }
}

function _dispatchChild(c: _Disposer): () => void {
  return () => c.dispose()
}

export function createDisposer(): Disposer {
  return new _Disposer()
}

/**
 * Shared no-op disposer for rows that register no cleanup work.
 *
 * The compiler references this (via `@geajs/core`'s export surface) whenever
 * a keyed-list site proves `noRowDisposer: true` — cheaper than emitting a
 * fresh `{ add() {}, dispose() {}, child() { return this } }` literal per
 * row. 09 clear1k ×8 was paying ~8k object-literal allocations before.
 */
export const NOOP_DISPOSER: Disposer = {
  add(_fn: () => void): void {
    /* no-op */
  },
  dispose(): void {
    /* no-op */
  },
  child(): Disposer {
    return NOOP_DISPOSER
  },
}
