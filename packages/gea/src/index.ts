/**
 * @geajs/core — public surface after Phase 4 cleanup.
 *
 * Single Component class (closure-compiled), single Store.
 */

import { Component as _Component } from './runtime/component'
import { Store as _Store } from './store'
export { Component } from './runtime/component'
export { Store } from './store'

// Default export: bundle-like shape `{ Component, Store }` preserved for
// callers that rely on destructuring `gea.default.Store`.
const _default = { Component: _Component, Store: _Store }
export default _default
export { escapeHtml as geaEscapeHtml, sanitizeAttr as geaSanitizeAttr } from './xss'
export { createRouter, Router, router, matchRoute, Link, Outlet, RouterView } from './router/index'

// Re-export from the shared symbols module, which forwards runtime/symbols
// and keeps the aliases consumed by downstream packages.
export * from './symbols'

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
