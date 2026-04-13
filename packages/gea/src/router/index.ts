export { createRouter, router } from './singleton'
export { Router } from './router'
export { default as Link } from './link'
export { default as Outlet } from './outlet'
export { default as RouterView } from './router-view'
export { matchRoute } from './match'
export type {
  RouteMap,
  RouteEntry,
  RouteGroupConfig,
  RouterOptions,
  GuardFn,
  GuardResult,
  NavigationTarget,
  InferRouteProps,
} from './types'
