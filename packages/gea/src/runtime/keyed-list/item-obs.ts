/**
 * Per-item observable for keyed-list rows that have item-rooted reactive
 * bindings NOT extractable into patchRow (e.g., destructured item params,
 * reactive getters referencing `item` inside createItem). Each row gets
 * one `ItemObservable` and one Proxy wrapping it so that `trackRead` picks
 * up a dep on the current item value.
 *
 * Elided at the keyed-list level when `cfg.noItemProxy` is true — the
 * compiler sets that flag when it proves createItem has no such bindings.
 */
import { GEA_PROXY_RAW } from '../../symbols'
import { trackRead } from '../with-tracking'
import type { ItemObservable } from './types'

// Class-based (prototype shares observe/_fire) + tombstone-array observer
// list. Per-row savings: no per-instance method closures (was 2 per row),
// and O(1) unsubscribe for teardown (was Set.delete hop + hash probe per
// binding × rows on 09_clear1k).
// The tombstone is a shared no-op, not `null`. A `((() => void) | null)[]`
// field gives geatsc two incompatible vector element representations for the
// same class field (`vector<function...>` from the pushes, `vector<null>` from
// the tombstone write) and it aborts with "Static representation conflict for
// class-field ... ItemObs:_o". One element type keeps the field exact; the
// unsubscribe is still O(1) and a fired tombstone is a single empty call.
function _TOMBSTONE(): void {
  /* unsubscribed observer */
}

class ItemObs<T> implements ItemObservable<T> {
  current: T
  _o: Array<() => void> = []
  constructor(initial: T) {
    this.current = initial
  }
  observe(_path: string | string[], fn: () => void): () => void {
    const idx = this._o.length
    this._o.push(fn)
    return () => {
      this._o[idx] = _TOMBSTONE
    }
  }
  _fire(): void {
    for (let i = 0; i < this._o.length; i++) {
      this._o[i]()
    }
  }
}

export function createItemObservable<T>(initial: T): ItemObservable<T> {
  return new ItemObs(initial)
}

/** Read a row's current value, including primitives, while recording its dependency. */
export function readItem<T>(obs: ItemObservable<T>): T {
  trackRead(obs as object, 'current')
  return obs.current
}

/**
 * A live-reading proxy standing in for `obs.current` — property reads
 * forward to whatever the CURRENT item is (not the item at proxy-creation
 * time), so it's typed as `T` itself: everywhere it's used, it's meant to
 * read exactly like the item it wraps.
 */
export function createItemProxy<T>(obs: ItemObservable<T>): T {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === GEA_PROXY_RAW) return obs.current
        trackRead(obs as object, 'current')
        const cur = obs.current
        if (cur == null) return undefined
        return (cur as Record<PropertyKey, unknown>)[prop]
      },
      has(_t, prop) {
        const cur = obs.current
        return cur != null && prop in Object(cur)
      },
      ownKeys() {
        const cur = obs.current
        return cur != null ? Reflect.ownKeys(Object(cur)) : []
      },
      getOwnPropertyDescriptor(_t, prop) {
        const cur = obs.current
        if (cur == null) return undefined
        return (
          Object.getOwnPropertyDescriptor(Object(cur), prop) ?? {
            enumerable: true,
            configurable: true,
            value: (cur as Record<PropertyKey, unknown>)[prop],
          }
        )
      },
    },
  ) as T
}
