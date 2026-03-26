import type { GeaStore, StoreSnapshot } from './types'
import { isInternalProp } from './types'
import { deepClone } from './ssr-context'

export function snapshotStores(stores: GeaStore[]): StoreSnapshot {
  return stores.map((store) => {
    const data: Record<string, unknown> = {}
    for (const key of Object.getOwnPropertyNames(store)) {
      if (isInternalProp(key)) continue
      if (key === 'constructor') continue
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
    const snapshotKeys = new Set(Object.keys(data))
    for (const key of Object.getOwnPropertyNames(store)) {
      if (isInternalProp(key) || key === 'constructor') continue
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
