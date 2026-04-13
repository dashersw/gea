import { GEA_PROXY_GET_RAW_TARGET, GEA_PROXY_IS_PROXY, GEA_PROXY_RAW, type Store } from '@geajs/core'
import {
  findPropertyDescriptor,
  isClassConstructorValue,
  rootDeleteProperty,
  rootGetValue,
  rootSetValue,
} from '@geajs/core/ssr'
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
        if (typeof prop === 'symbol') {
          if (prop === GEA_PROXY_IS_PROXY) return true
          if (prop === GEA_PROXY_RAW || prop === GEA_PROXY_GET_RAW_TARGET) return t
          return Reflect.get(t, prop, receiver)
        }
        const overlay = resolveOverlay(t)
        if (overlay !== undefined) {
          if (Object.prototype.hasOwnProperty.call(overlay, prop)) {
            const val = overlay[prop]
            return val === SSR_DELETED ? undefined : val
          }
          const v = Reflect.get(t, prop, receiver)
          if (typeof v !== 'function') return v
          return isClassConstructorValue(v) ? v : v.bind(receiver)
        }
        const v = rootGetValue(t, prop, receiver)
        if (typeof v !== 'function') return v
        return isClassConstructorValue(v) ? v : v.bind(receiver)
      },
      set(t, prop, value, receiver) {
        if (typeof prop === 'symbol') {
          ;(t as any)[prop] = value
          return true
        }
        const desc = findPropertyDescriptor(t, prop)
        if (desc?.set) {
          return Reflect.set(t, prop, value, receiver)
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
        const desc = findPropertyDescriptor(t, prop)
        if (desc && (desc.get || desc.set)) {
          return Reflect.deleteProperty(t, prop)
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
            if (typeof key === 'string' && key !== 'constructor') {
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
        if (typeof prop === 'string') {
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
