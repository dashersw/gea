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
class ItemObs implements ItemObservable {
  current: any
  _o: Array<(() => void) | null> = []
  constructor(initial: any) {
    this.current = initial
  }
  observe(_path: string | string[], fn: () => void): () => void {
    const o = this._o
    const idx = o.length
    o.push(fn)
    return () => {
      o[idx] = null
    }
  }
  _fire(): void {
    const o = this._o
    for (let i = 0; i < o.length; i++) {
      const fn = o[i]
      if (fn) fn()
    }
  }
}

export function createItemObservable(initial: any): ItemObservable {
  return new ItemObs(initial)
}

export function createItemProxy(obs: ItemObservable): any {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === GEA_PROXY_RAW) return obs.current
        trackRead(obs as any, 'current')
        const cur = obs.current
        if (cur == null) return undefined
        return (cur as any)[prop as any]
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
            value: (cur as any)[prop as any],
          }
        )
      },
    },
  )
}
