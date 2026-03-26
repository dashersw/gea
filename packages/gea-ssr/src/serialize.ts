import { uneval } from 'devalue'
import type { GeaStore, StoreRegistry } from './types'
import { isInternalProp } from './types'

/**
 * Extract serializable data from a store, filtering internal props and functions.
 */
function extractStoreData(store: GeaStore): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const key of Object.keys(store)) {
    if (isInternalProp(key)) continue
    if (key === 'constructor' || key === '__proto__') continue
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
export function serializeStores(
  stores: GeaStore[],
  registry: StoreRegistry,
): string {
  const state: Record<string, Record<string, unknown>> = {}
  for (const [name, store] of Object.entries(registry)) {
    if (!stores.includes(store)) continue
    state[name] = extractStoreData(store)
  }
  return uneval(state)
}
