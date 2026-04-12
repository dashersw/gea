import type { GeaStore, StoreSnapshot } from './types'
import { deepClone, getSignalFields } from './ssr-context'
import { STORE_IMPL_OWN_KEYS } from './types'

export function snapshotStores(stores: GeaStore[]): StoreSnapshot {
  return stores.map((store) => {
    const data: Record<string, unknown> = {}

    // Try signal fields first (v2 compiled stores)
    const signals = getSignalFields(store)
    if (signals.size > 0) {
      for (const [fieldName, sig] of signals) {
        if (fieldName === 'constructor') continue
        const value = sig.peek()
        if (typeof value === 'function') continue
        try {
          data[fieldName] = deepClone(fieldName, value)
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          console.warn(`[GEA SSR] snapshotStores: skipping property "${fieldName}" — ${msg}`)
        }
      }
      return [store, data]
    }

    // Fallback: plain object (backward compat / tests)
    for (const key of Object.getOwnPropertyNames(store)) {
      if (key === 'constructor' || STORE_IMPL_OWN_KEYS.has(key)) continue
      const descriptor = Object.getOwnPropertyDescriptor(store, key)
      if (!descriptor || typeof descriptor.value === 'function') continue
      if (typeof descriptor.get === 'function') continue
      try {
        data[key] = deepClone(key, descriptor.value)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.warn(`[GEA SSR] snapshotStores: skipping property "${key}" — ${msg}`)
      }
    }
    return [store, data]
  })
}

export function restoreStores(snapshots: StoreSnapshot): void {
  for (const [store, data] of snapshots) {
    // Try signal fields first (v2 compiled stores)
    const signals = getSignalFields(store)
    if (signals.size > 0) {
      for (const [fieldName, sig] of signals) {
        if (fieldName in data) {
          sig.value = data[fieldName]
        }
      }
      continue
    }

    // Fallback: plain object (backward compat / tests)
    const snapshotKeys = new Set(Object.keys(data))
    for (const key of Object.getOwnPropertyNames(store)) {
      if (key === 'constructor' || STORE_IMPL_OWN_KEYS.has(key)) continue
      if (snapshotKeys.has(key)) continue
      const descriptor = Object.getOwnPropertyDescriptor(store, key)
      if (!descriptor) continue
      if (typeof descriptor.value === 'function') continue
      if (typeof descriptor.get === 'function') continue
      if (descriptor.configurable) {
        delete store[key]
      }
    }
    for (const [key, value] of Object.entries(data)) {
      store[key] = value
    }
  }
}
