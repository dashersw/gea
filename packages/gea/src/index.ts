export { default as Component, __escapeHtml, __sanitizeAttr } from './lib/base/component'
export { resetUidCounter, setUidProvider, clearUidProvider } from './lib/base/uid'
export { Store, isInternalProp, rootGetValue, rootSetValue, rootDeleteProperty } from './lib/store'
export { h } from './lib/h'
export type { DOMEvent } from './lib/types'
export { default as ComponentManager } from './lib/base/component-manager'
export { applyListChanges } from './lib/base/list'
export type { ListConfig } from './lib/base/list'
export { createRouter, Router, router, matchRoute, Link, Outlet, RouterView } from './lib/router'
export type {
  RouteMap,
  RouteEntry,
  RouteGroupConfig,
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
