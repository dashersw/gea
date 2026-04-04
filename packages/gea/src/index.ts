export {
  default as Component,
  __escapeHtml as geaEscapeHtml,
  __sanitizeAttr as geaSanitizeAttr,
  stashComponentForTransfer,
} from './lib/base/component'
export * from './lib/symbols'
export { resetUidCounter, setUidProvider, clearUidProvider } from './lib/base/uid'
export {
  Store,
  findPropertyDescriptor,
  rootGetValue,
  rootSetValue,
  rootDeleteProperty,
  isClassConstructorValue,
} from './lib/store'
export { h } from './lib/h'
export type { DOMEvent } from './lib/types'
export { default as ComponentManager } from './lib/base/component-manager'
export { applyListChanges } from './lib/base/list'
export type { ListConfig } from './lib/base/list'
export { createRouter, Router, router, matchRoute, resolveRoute, Link, Outlet, RouterView } from './lib/router'
export { Head } from './lib/head'
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
} from './lib/router'

import Component from './lib/base/component'
import { applyListChanges } from './lib/base/list'
import { Store } from './lib/store'
import { h } from './lib/h'

const gea = {
  Store,
  Component,
  applyListChanges,
  h,
}

export default gea
