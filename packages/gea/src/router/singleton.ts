import { Router } from './router'
import { getSSRRouterResolver } from './context'
import type { RouteMap, RouterOptions } from './types'

export function createRouter<T extends RouteMap>(routes: T, options?: RouterOptions): Router<T> {
  return new Router<T>(routes, options)
}

let defaultSingleton: Router | null = null

/** Lazily-created singleton router — only instantiated on first access so
 *  projects that don't use the router pay zero cost. */
export const router: Router = new Proxy({} as Router, {
  get(_target, prop, receiver) {
    const ssrRouter = getSSRRouterResolver()?.()
    if (ssrRouter) return Reflect.get(ssrRouter, prop, receiver)
    if (!defaultSingleton) defaultSingleton = new Router()
    return Reflect.get(defaultSingleton, prop, receiver)
  },
  set(_target, prop, value) {
    const ssrRouter = getSSRRouterResolver()?.()
    if (ssrRouter) return Reflect.set(ssrRouter, prop, value)
    if (!defaultSingleton) defaultSingleton = new Router()
    return Reflect.set(defaultSingleton, prop, value)
  },
})
