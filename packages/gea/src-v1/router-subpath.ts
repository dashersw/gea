/** `@geajs/core/router` entry: re-export from package root so `router.d.mts` shares types with `index.d.mts`. */
export { createRouter, Router, router, matchRoute, Link, Outlet, RouterView } from './index.js'

export type {
  RouteMap,
  RouteEntry,
  RouteGroupConfig,
  RouterOptions,
  GuardFn,
  GuardResult,
  NavigationTarget,
  InferRouteProps,
} from './index.js'
