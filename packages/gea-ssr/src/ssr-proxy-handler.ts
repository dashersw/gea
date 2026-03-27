import { isInternalProp, rootDeleteProperty, rootGetValue, rootSetValue, type Store } from '@geajs/core'
import { resolveOverlay } from './ssr-context'

/** Sentinel for SSR overlay deletes — must match overlay checks in traps below */
export const SSR_DELETED: symbol = Symbol('ssrDeleted')

let cachedHandler: ProxyHandler<Store> | undefined

/**
 * Root Proxy handler for SSR: overlay + 7 traps (has/ownKeys/getOwnPropertyDescriptor).
 * Cached singleton — same shape as the previous core implementation.
 */
export function createSSRRootProxyHandler(): ProxyHandler<Store> {
  if (!cachedHandler) {
    cachedHandler = {
      get(t, prop, receiver) {
        if (typeof prop === 'symbol') return Reflect.get(t, prop, receiver)
        if (prop === '__isProxy') return true
        if (prop === '__raw') return t
        if (prop === '__getRawTarget') return t
        if (isInternalProp(prop)) return Reflect.get(t, prop, receiver)
        const overlay = resolveOverlay(t)
        if (overlay !== undefined) {
          if (Object.prototype.hasOwnProperty.call(overlay, prop)) {
            const val = overlay[prop]
            return val === SSR_DELETED ? undefined : val
          }
          return Reflect.get(t, prop, receiver)
        }
        return rootGetValue(t, prop, receiver)
      },
      set(t, prop, value) {
        if (typeof prop === 'symbol') {
          ;(t as any)[prop] = value
          return true
        }
        if (isInternalProp(prop)) {
          ;(t as any)[prop] = value
          return true
        }
        const overlay = resolveOverlay(t)
        if (overlay !== undefined) {
          overlay[prop as string] = value
          return true
        }
        return rootSetValue(t, prop, value)
      },
      deleteProperty(t, prop) {
        if (typeof prop === 'symbol') {
          delete (t as any)[prop]
          return true
        }
        if (isInternalProp(prop)) {
          delete (t as any)[prop]
          return true
        }
        const overlay = resolveOverlay(t)
        if (overlay !== undefined) {
          overlay[prop as string] = SSR_DELETED
          return true
        }
        return rootDeleteProperty(t, prop)
      },
      has(t, prop) {
        if (typeof prop === 'symbol') return Reflect.has(t, prop)
        if (isInternalProp(prop)) return Reflect.has(t, prop)
        const overlay = resolveOverlay(t)
        if (overlay !== undefined) {
          if (Object.prototype.hasOwnProperty.call(overlay, prop)) {
            return overlay[prop as string] !== SSR_DELETED
          }
        }
        return Reflect.has(t, prop)
      },
      ownKeys(t) {
        const overlay = resolveOverlay(t)
        if (overlay !== undefined) {
          const targetKeys = Reflect.ownKeys(t)
          const overlayKeys = Object.keys(overlay)
          const combined = new Set<string | symbol>([...targetKeys, ...overlayKeys])
          for (const key of combined) {
            if (typeof key === 'string' && !isInternalProp(key) && key !== 'constructor') {
              if (Object.prototype.hasOwnProperty.call(overlay, key) && overlay[key] === SSR_DELETED) {
                combined.delete(key)
              }
            }
          }
          return [...combined]
        }
        return Reflect.ownKeys(t)
      },
      getOwnPropertyDescriptor(t, prop) {
        if (typeof prop === 'string' && !isInternalProp(prop)) {
          const overlay = resolveOverlay(t)
          if (overlay !== undefined) {
            if (Object.prototype.hasOwnProperty.call(overlay, prop)) {
              if (overlay[prop] === SSR_DELETED) return undefined
              return { value: overlay[prop], writable: true, enumerable: true, configurable: true }
            }
          }
        }
        return Reflect.getOwnPropertyDescriptor(t, prop)
      },
      defineProperty(t, prop, descriptor) {
        return Reflect.defineProperty(t, prop, descriptor)
      },
    }
  }
  return cachedHandler
}
