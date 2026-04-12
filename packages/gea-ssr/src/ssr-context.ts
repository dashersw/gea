import { AsyncLocalStorage } from 'node:async_hooks'
import { signal as createSignal, setUidProvider } from '@geajs/core'
import { STORE_IMPL_OWN_KEYS } from './types'

export { STORE_IMPL_OWN_KEYS } from './types'

// ---------------------------------------------------------------------------
// SSR contexts (AsyncLocalStorage)
// ---------------------------------------------------------------------------

// For plain-object stores: maps store → cloned data overlay
const ssrContext = new AsyncLocalStorage<WeakMap<object, Record<string, unknown>>>()

// For signal-based stores: maps store → Map<symbol, Signal>
// Each SSR request gets its own Signal instances per store field.
const ssrSignalContext = new AsyncLocalStorage<WeakMap<object, Map<symbol, any>>>()

// Per-request UID counter for deterministic, isolated ID generation
const ssrUidContext = new AsyncLocalStorage<{ counter: number }>()

// Register SSR-scoped UID provider.
setUidProvider(
  () => {
    const ctx = ssrUidContext.getStore()
    return ctx ? (ctx.counter++).toString(36) : null
  },
  (seed) => {
    const ctx = ssrUidContext.getStore()
    if (!ctx) return false
    ctx.counter = seed
    return true
  },
)

// ---------------------------------------------------------------------------
// Overlay helpers (plain-object stores)
// ---------------------------------------------------------------------------

/**
 * Returns the per-request data overlay for a plain-object store,
 * or undefined if not in SSR context.
 */
export function resolveOverlay(target: object): Record<string, unknown> | undefined {
  return ssrContext.getStore()?.get(target)
}

// ---------------------------------------------------------------------------
// Deep clone helpers
// ---------------------------------------------------------------------------

function isClonable(value: unknown): boolean {
  if (value === null || value === undefined) return true
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return true
  if (t === 'symbol' || t === 'bigint') return false
  if (t !== 'object') return false
  if (Array.isArray(value)) return true
  if (value instanceof Date) return true
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function assertClonable(key: string, value: unknown): void {
  if (!isClonable(value)) {
    const typeName =
      value === null
        ? 'null'
        : typeof value === 'object'
          ? (Object.getPrototypeOf(value)?.constructor?.name ?? typeof value)
          : typeof value
    throw new Error(
      `[GEA SSR] Store property "${key}" contains an unsupported type (${typeName}). ` +
        'Only primitives, plain objects, arrays, and Dates are supported in SSR store data.',
    )
  }
}

export function deepClone(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return value
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (value instanceof Date) return new Date(value.getTime())
  if (Array.isArray(value)) return value.map((item, i) => deepClone(`${key}[${i}]`, item))
  if (!isPlainObject(value)) {
    const typeName = Object.getPrototypeOf(value)?.constructor?.name ?? typeof value
    throw new Error(
      `[GEA SSR] Store property "${key}" contains an unsupported type (${typeName}). ` +
        'Only primitives, plain objects, arrays, and Dates are supported in SSR store data.',
    )
  }
  const result: Record<string, unknown> = {}
  for (const k of Object.keys(value)) {
    result[k] = deepClone(`${key}.${k}`, value[k])
  }
  return result
}

// ---------------------------------------------------------------------------
// Signal field helpers
// ---------------------------------------------------------------------------

const GEA_FIELD_PREFIX = 'gea.field.'

/** Enumerate all compiled signal fields on a store object.
 *  Returns a Map of fieldName → Signal instance.
 *  If inside an SSR context with overridden signals, returns those instead. */
export function getSignalFields(store: object): Map<string, any> {
  const fields = new Map<string, any>()
  const ssrOverrides = ssrSignalContext.getStore()?.get(store)

  for (const sym of Object.getOwnPropertySymbols(store)) {
    const desc = sym.description ?? ''
    if (desc.startsWith(GEA_FIELD_PREFIX)) {
      const fieldName = desc.slice(GEA_FIELD_PREFIX.length)
      // Prefer SSR-context signal if available
      const sig = ssrOverrides?.get(sym) ?? (store as any)[sym]
      fields.set(fieldName, sig)
    }
  }
  return fields
}

/** Check whether an object has signal fields (is a compiled v2 Store). */
export function hasSignalFields(store: object): boolean {
  for (const sym of Object.getOwnPropertySymbols(store)) {
    const desc = sym.description ?? ''
    if (desc.startsWith(GEA_FIELD_PREFIX)) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// cloneStoreData
// ---------------------------------------------------------------------------

/**
 * Deep-clone a store's serializable data properties into a plain object.
 * Works with both signal-based stores and plain objects.
 */
export function cloneStoreData(store: object): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  // Try signal fields first
  const signals = getSignalFields(store)
  if (signals.size > 0) {
    for (const [fieldName, sig] of signals) {
      if (fieldName === 'constructor') continue
      const value = sig.peek()
      if (typeof value === 'function') continue
      assertClonable(fieldName, value)
      data[fieldName] = deepClone(fieldName, value)
    }
    return data
  }

  // Fallback: plain object
  for (const key of Object.getOwnPropertyNames(store)) {
    if (key === 'constructor' || STORE_IMPL_OWN_KEYS.has(key)) continue
    const descriptor = Object.getOwnPropertyDescriptor(store, key)
    if (!descriptor || typeof descriptor.value === 'function') continue
    if (typeof descriptor.get === 'function') continue
    assertClonable(key, descriptor.value)
    data[key] = deepClone(key, descriptor.value)
  }
  return data
}

// ---------------------------------------------------------------------------
// runInSSRContext
// ---------------------------------------------------------------------------

/**
 * Run a function inside an SSR context with per-request store data isolation.
 *
 * For signal-based stores: creates per-request Signal instances that are swapped
 * into the store via Object.defineProperty getters backed by AsyncLocalStorage.
 * This ensures concurrent SSR requests each see their own signal values.
 *
 * For plain-object stores: creates overlay maps accessible via resolveOverlay().
 */
// Tracks which store+symbol pairs have SSR getters installed.
// The getter delegates to AsyncLocalStorage for per-request resolution.
// Once installed, getters stay in place (they fall back to the original
// signal when no SSR context is active, so there's no performance impact).
const _installedGetters = new WeakMap<object, Set<symbol>>()

export function runInSSRContext<T>(stores: object[], fn: () => T | Promise<T>): T | Promise<T> {
  const plainOverlays = new WeakMap<object, Record<string, unknown>>()
  const signalOverrides = new WeakMap<object, Map<symbol, any>>()

  for (const store of stores) {
    if (hasSignalFields(store)) {
      // Signal-based store: create per-request signal clones
      const overrideMap = new Map<symbol, any>()
      let installedSet = _installedGetters.get(store)

      for (const sym of Object.getOwnPropertySymbols(store)) {
        const desc = sym.description ?? ''
        if (!desc.startsWith(GEA_FIELD_PREFIX)) continue

        const fieldName = desc.slice(GEA_FIELD_PREFIX.length)

        // Read the ORIGINAL signal — if a getter is already installed,
        // reading outside any SSR context returns the original signal.
        const originalSig = (store as any)[sym]
        if (!originalSig || typeof originalSig.peek !== 'function') continue

        const originalValue = originalSig.peek()

        // Create a new signal with a deep-cloned value for this request
        let clonedValue: unknown
        try {
          clonedValue = typeof originalValue === 'function' ? originalValue : deepClone(fieldName, originalValue)
        } catch {
          clonedValue = originalValue
        }
        const requestSignal = createSignal(clonedValue)
        overrideMap.set(sym, requestSignal)

        // Install a getter/setter ONCE per store+symbol.
        // The getter always delegates to ALS for the current request,
        // falling back to the original signal when outside SSR.
        if (!installedSet) {
          installedSet = new Set()
          _installedGetters.set(store, installedSet)
        }
        if (!installedSet.has(sym)) {
          installedSet.add(sym)
          Object.defineProperty(store, sym, {
            get() {
              const ctx = ssrSignalContext.getStore()
              const overrides = ctx?.get(store)
              return overrides?.get(sym) ?? originalSig
            },
            set(v: any) {
              const ctx = ssrSignalContext.getStore()
              const overrides = ctx?.get(store)
              if (overrides) {
                overrides.set(sym, v)
              } else {
                // Outside SSR — write directly to original signal property
                // (this shouldn't normally happen, but handle gracefully)
                installedSet!.delete(sym)
                Object.defineProperty(store, sym, {
                  value: v,
                  writable: true,
                  enumerable: false,
                  configurable: true,
                })
              }
            },
            enumerable: false,
            configurable: true,
          })
        }
      }

      signalOverrides.set(store, overrideMap)
    } else {
      // Plain-object store: use overlay map
      plainOverlays.set(store, cloneStoreData(store))
    }
  }

  return ssrSignalContext.run(signalOverrides, () =>
    ssrContext.run(plainOverlays, () =>
      ssrUidContext.run({ counter: 0 }, fn),
    ),
  )
}
