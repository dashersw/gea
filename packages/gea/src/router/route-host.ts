import { Component } from '../runtime/component'
import { GEA_SET_PROPS } from '../runtime/internal-symbols'
import {
  GEA_CHILD_COMPONENTS,
  GEA_CREATE_TEMPLATE,
  GEA_DOM_COMPILED_CHILD_ROOT,
  GEA_ELEMENT,
  GEA_IS_ROUTER_OUTLET,
  GEA_PARENT_COMPONENT,
  GEA_ROUTER_DEPTH,
  GEA_ROUTER_REF,
} from '../symbols'
import { getDefaultRouter } from './context'
import type { Router } from './router'

export interface RouteHostState {
  currentChild: Component | null
  currentComponentClass: any
  lastCacheKey: string | null
  lastPath: string | undefined
  observerRemovers: Array<() => void>
  routesApplied: boolean
}

const ROUTE_HOST_STATE = Symbol('gea.routeHost.state')

export function routeHostState(host: object): RouteHostState {
  let state = (host as any)[ROUTE_HOST_STATE] as RouteHostState | undefined
  if (!state) {
    state = {
      currentChild: null,
      currentComponentClass: null,
      lastCacheKey: null,
      lastPath: undefined,
      observerRemovers: [],
      routesApplied: false,
    }
    ;(host as any)[ROUTE_HOST_STATE] = state
  }
  return state
}

export function createRouteHostElement(host: Component): HTMLDivElement {
  const el = document.createElement('div')
  el.id = host.id
  return el
}

export function defineRouteHostPrototype(proto: object, templateMethod: string | symbol): void {
  Object.defineProperty(proto, GEA_IS_ROUTER_OUTLET, {
    value: true,
    enumerable: false,
    configurable: true,
  })
  Object.defineProperty(proto, templateMethod, {
    value: (proto as any)._createRouteHostTemplate,
    enumerable: false,
    writable: true,
    configurable: true,
  })
}

export function resolveNestedRouteHost(host: Component): { depth: number; router: Router | null } {
  let depth = 0
  let router: Router | null = null
  let parent: any = (host as any)[GEA_PARENT_COMPONENT]
  while (parent) {
    if (parent[GEA_IS_ROUTER_OUTLET]) {
      depth = parent[GEA_ROUTER_DEPTH] + 1
      router = parent[GEA_ROUTER_REF] ?? parent.props?.router ?? null
      break
    }
    parent = parent[GEA_PARENT_COMPONENT]
  }
  return { depth, router: router ?? getDefaultRouter() }
}

export function bindRouteHost(host: Component, state: RouteHostState, router: Router, update: () => void): void {
  if (router === (host as any)[GEA_ROUTER_REF] && state.observerRemovers.length > 0) return

  for (const remove of state.observerRemovers) remove()
  state.observerRemovers = []
  ;(host as any)[GEA_ROUTER_REF] = router

  state.observerRemovers.push(
    router.observe('path', update),
    router.observe('error', update),
    router.observe('query', update),
  )
}

export function disposeRouteHost(host: Component, state: RouteHostState): void {
  for (const remove of state.observerRemovers) remove()
  state.observerRemovers = []
  clearRouteHost(host, state)
  ;(host as any)[GEA_ROUTER_REF] = null
}

export function updateRootRouteHost(host: Component, state: RouteHostState): void {
  const router = ((host as any)[GEA_ROUTER_REF] ?? host.props?.router ?? getDefaultRouter()) as Router | null
  if (!router || !host.el) return

  const item = routeItem(host, state, router, 0)
  if (!item) return

  const same = state.currentComponentClass === item.component
  if (same && router.layoutCount > 0 && (item.cacheKey === null || item.cacheKey === state.lastCacheKey)) return
  if (same && router.layoutCount === 0 && router.path === state.lastPath) return

  clearRouteHost(host, state)
  while (host.el.firstChild) host.el.removeChild(host.el.firstChild)
  mountRouteChild(host, state, item, false)
  rememberRoute(state, router, item)
}

export function updateNestedRouteHost(host: Component, state: RouteHostState): void {
  const router = ((host as any)[GEA_ROUTER_REF] ?? host.props?.router ?? getDefaultRouter()) as Router | null
  if (!router || !host.el) return

  const depth = (host as any)[GEA_ROUTER_DEPTH] ?? 0
  const item = routeItem(host, state, router, depth)
  if (!item) return

  const same = state.currentComponentClass === item.component
  const leaf = depth >= router.layoutCount
  if (same && (!leaf ? item.cacheKey === null || item.cacheKey === state.lastCacheKey : true)) {
    rememberRoute(state, router, item)
    return
  }

  clearRouteHost(host, state)
  mountRouteChild(host, state, item, true)
  rememberRoute(state, router, item)
}

function routeItem(host: Component, state: RouteHostState, router: Router, depth: number) {
  const currentChildEl = state.currentChild ? getComponentElement(state.currentChild) : null
  if (state.currentChild && (!currentChildEl || !host.el!.contains(currentChildEl))) {
    clearRouteHost(host, state)
  }

  const item = router.getComponentAtDepth(depth)
  if (!item) clearRouteHost(host, state)
  return item
}

function clearRouteHost(host: Component, state: RouteHostState): void {
  if (state.currentChild) {
    state.currentChild.dispose()
    state.currentChild = null
    ;(host as any)[GEA_CHILD_COMPONENTS] = []
  }
  state.currentComponentClass = null
  state.lastCacheKey = null
}

function mountRouteChild(
  host: Component,
  state: RouteHostState,
  item: NonNullable<ReturnType<Router['getComponentAtDepth']>>,
  markCompiledRoot: boolean,
): void {
  if (!isClassComponent(item.component)) return

  const child = new item.component()
  ;(child as any)[GEA_PARENT_COMPONENT] = host
  installRouteProps(child, item.props)
  child.render(host.el!)
  const childEl = getComponentElement(child)
  if (markCompiledRoot && childEl) {
    ;(childEl as any)[GEA_DOM_COMPILED_CHILD_ROOT] = true
  }
  state.currentChild = child
  state.currentComponentClass = item.component
  ;(host as any)[GEA_CHILD_COMPONENTS] = [child]
}

function rememberRoute(
  state: RouteHostState,
  router: Router,
  item: NonNullable<ReturnType<Router['getComponentAtDepth']>>,
): void {
  state.lastCacheKey = item.cacheKey
  state.lastPath = router.path
}

function installRouteProps(child: Component, props: Record<string, any> | undefined): void {
  if (!props) return
  const thunks: Record<string, () => any> = {}
  for (const k of Object.keys(props)) {
    const v = props[k]
    thunks[k] = () => v
  }
  const setProps = (child as any)[GEA_SET_PROPS]
  if (typeof setProps === 'function') setProps.call(child, thunks)
}

function isClassComponent(comp: any): boolean {
  if (!comp || typeof comp !== 'function') return false
  let proto = comp.prototype
  while (proto) {
    if (proto === Component.prototype) return true
    if (proto.constructor && proto.constructor.name === 'Component') return true
    if (typeof proto[GEA_CREATE_TEMPLATE] === 'function' && typeof proto.render === 'function') return true
    if (typeof proto.render === 'function' && typeof proto.dispose === 'function') return true
    proto = Object.getPrototypeOf(proto)
  }
  return false
}

function getComponentElement(component: any): Element | null {
  return (component && ((component as any)[GEA_ELEMENT] || component.el)) || null
}
