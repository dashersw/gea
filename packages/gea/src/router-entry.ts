export { createRouter, router } from './router/singleton'
export { Router } from './router/router'
export { default as Link } from './router/link'
export { default as Outlet } from './router/outlet'
export { default as RouterView } from './router/router-view'
export { matchRoute } from './router/match'
export type {
  RouteMap,
  RouteEntry,
  RouteGroupConfig,
  RouterOptions,
  GuardFn,
  GuardResult,
  NavigationTarget,
  InferRouteProps,
} from './router/types'
