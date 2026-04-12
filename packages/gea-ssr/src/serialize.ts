import { uneval } from 'devalue'
import type { GeaStore, StoreRegistry } from './types'
import { STORE_IMPL_OWN_KEYS } from './types'
import { getSignalFields } from './ssr-context'

/**
 * Extract serializable data from a store, filtering functions and Store implementation fields.
 * Works with both signal-based stores (v2) and plain-object stores.
 */
function extractStoreData(store: GeaStore): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  // Try signal fields first (v2 compiled stores)
  const signals = getSignalFields(store)
  if (signals.size > 0) {
    for (const [fieldName, sig] of signals) {
      if (fieldName === 'constructor' || fieldName === '__proto__') continue
      const value = sig.peek()
      if (typeof value === 'function') continue
      data[fieldName] = value
    }
    return data
  }

  // Fallback: plain object (backward compat / tests)
  for (const key of Object.keys(store)) {
    if (key === 'constructor' || key === '__proto__' || STORE_IMPL_OWN_KEYS.has(key)) continue
    const value: unknown = store[key]
    if (typeof value === 'function') continue
    data[key] = value
  }
  return data
}

/**
 * Serialize all registered stores into a JavaScript expression string.
 * Uses devalue.uneval() which:
 * - Produces self-contained JS (no parse step needed on client)
 * - Preserves Date, Map, Set, BigInt, RegExp, URL
 * - Handles circular/repeated references
 * - Escapes </script> for safe embedding in HTML
 */
export function serializeStores(stores: GeaStore[], registry: StoreRegistry): string {
  const state: Record<string, Record<string, unknown>> = {}
  for (const [name, store] of Object.entries(registry)) {
    if (!stores.includes(store)) continue
    state[name] = extractStoreData(store)
  }
  return uneval(state)
}
