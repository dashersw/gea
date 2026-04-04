import { Router } from './router'
import Link from './link'
import Outlet from './outlet'
import RouterView from './router-view'
import type { RouteMap, RouterOptions } from './types'

export function createRouter<T extends RouteMap>(routes: T, options?: RouterOptions): Router<T> {
  return new Router<T>(routes, options)
}

let _router: Router | null = null

/** Lazily-created singleton router — only instantiated on first access so
 *  projects that don't use the router pay zero cost. */
const router: Router = new Proxy({} as Router, {
  get(_target, prop, receiver) {
    const ssrRouter = Router._ssrRouterResolver?.()
    if (ssrRouter) return Reflect.get(ssrRouter, prop, receiver)
    if (!_router) _router = new Router()
    return Reflect.get(_router, prop, receiver)
  },
  set(_target, prop, value) {
    const ssrRouter = Router._ssrRouterResolver?.()
    if (ssrRouter) return Reflect.set(ssrRouter, prop, value)
    if (!_router) _router = new Router()
    return Reflect.set(_router, prop, value)
  },
})

export { router, Router }
export { Link }
export { Outlet }
export { RouterView }
export { matchRoute } from './match'
export { resolveRoute } from './resolve'
export type {
  RouteMap,
  RouteEntry,
  RouteGroupConfig,
  SSGRouteConfig,
  ResolvedRoute,
  RouterOptions,
  GuardFn,
  GuardResult,
  NavigationTarget,
  InferRouteProps,
} from './types'
