import { AsyncLocalStorage } from 'node:async_hooks'
import { setUidProvider } from '@geajs/core'
import { isInternalProp } from './types'

// Maps raw store target → cloned data overlay for the current request
const ssrContext = new AsyncLocalStorage<WeakMap<object, Record<string, unknown>>>()

// Per-request UID counter for deterministic, isolated ID generation
const ssrUidContext = new AsyncLocalStorage<{ counter: number }>()

// Register SSR-scoped UID provider. When inside an SSR context (runInSSRContext),
// UID generation uses a per-request counter. Outside SSR, returns null to fall
// back to the global counter. This keeps @geajs/core free of node:async_hooks.
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

/**
 * Called by Store Proxy get/set/delete handlers.
 * Returns the per-request data overlay for a store, or undefined if not in SSR context.
 */
export function resolveOverlay(target: object): Record<string, unknown> | undefined {
  return ssrContext.getStore()?.get(target)
}

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
    const typeName = value === null ? 'null'
      : typeof value === 'object' ? Object.getPrototypeOf(value)?.constructor?.name ?? typeof value
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
  // Plain object — TypeScript knows value is Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const k of Object.keys(value)) {
    result[k] = deepClone(`${key}.${k}`, value[k])
  }
  return result
}

/**
 * Deep-clone a store's serializable data properties into a plain object.
 * Throws on unsupported types instead of silently dropping them.
 */
export function cloneStoreData(store: object): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const key of Object.getOwnPropertyNames(store)) {
    if (isInternalProp(key)) continue
    if (key === 'constructor') continue
    const descriptor = Object.getOwnPropertyDescriptor(store, key)
    if (!descriptor || typeof descriptor.value === 'function') continue
    if (typeof descriptor.get === 'function') continue
    assertClonable(key, descriptor.value)
    data[key] = deepClone(key, descriptor.value)
  }
  return data
}

/**
 * Run a function inside an SSR context with per-request store data overlays.
 * All store reads/writes within fn (and its async continuations) are isolated.
 */
/**
 * Get the raw target from a Store Proxy, or return the object as-is.
 */
function unwrapProxy(store: object): object {
  // Access __getRawTarget via Reflect.get (not `in`) because the Store Proxy's
  // `has` trap delegates internal props to Reflect.has on the raw target, which
  // returns false since __getRawTarget is synthetic — only the `get` trap handles it.
  const raw: unknown = Reflect.get(store, '__getRawTarget')
  if (typeof raw === 'object' && raw !== null) return raw
  return store
}

/**
 * Run a function inside an SSR context with per-request store data overlays.
 * All store reads/writes within fn (and its async continuations) are isolated.
 */
export function runInSSRContext<T>(
  stores: object[],
  fn: () => T | Promise<T>,
): T | Promise<T> {
  const overlays = new WeakMap<object, Record<string, unknown>>()
  for (const store of stores) {
    // Unwrap the Proxy to get the raw target — the Proxy handler passes
    // the raw target to resolveOverlay, so the WeakMap key must match.
    const raw = unwrapProxy(store)
    overlays.set(raw, cloneStoreData(raw))
  }
  return ssrContext.run(overlays, () =>
    ssrUidContext.run({ counter: 0 }, fn),
  )
}
