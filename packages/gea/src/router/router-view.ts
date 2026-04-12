import { Component } from '../component/component.js'
import {
  engineThis,
  GEA_CHILD_COMPONENTS,
  GEA_CREATE_TEMPLATE,
  GEA_ELEMENT,
  GEA_SET_PROPS,
  GEA_IS_ROUTER_OUTLET,
  GEA_PARENT_COMPONENT,
  GEA_PROXY_RAW,
  GEA_ROUTER_DEPTH,
  GEA_ROUTER_REF,
} from '../symbols.js'
import type { Router } from './router'
import type { RouteMap } from './types'
import Outlet from './outlet'

interface RouterViewPrivate {
  currentChild: Component | null
  currentComponentClass: any
  lastCacheKey: string | null
  lastPath: string | undefined
  observerRemovers: Array<() => void>
  routesApplied: boolean
}

const _rvp = new WeakMap<object, RouterViewPrivate>()

function rawView(v: RouterView): object {
  return (v as any)[GEA_PROXY_RAW] ?? v
}

function rvp(view: RouterView): RouterViewPrivate {
  const key = rawView(view)
  let p = _rvp.get(key)
  if (!p) {
    p = {
      currentChild: null,
      currentComponentClass: null,
      lastCacheKey: null,
      lastPath: undefined,
      observerRemovers: [],
      routesApplied: false,
    }
    _rvp.set(key, p)
  }
  return p
}

export default class RouterView extends Component {
  [GEA_ROUTER_DEPTH]: number = 0;
  [GEA_ROUTER_REF]: any = null

  override [GEA_CREATE_TEMPLATE]() {
    const el = document.createElement('div')
    el.id = this.id
    return el
  }

  onAfterRender() {
    const p = rvp(this)
    const router = this.props?.router ?? this[GEA_ROUTER_REF] ?? Outlet._router
    if (!router) return

    if (this.props?.routes && !p.routesApplied) {
      router.setRoutes(this.props.routes)
      p.routesApplied = true
    }

    if (router !== this[GEA_ROUTER_REF]) {
      _rebindRouter(this, p, router)
    } else if (p.observerRemovers.length === 0) {
      _rebindRouter(this, p, router)
    }

    _updateView(this, p)
  }

  dispose() {
    const p = rvp(this)
    for (const remove of p.observerRemovers) {
      remove()
    }
    p.observerRemovers = []
    _clearCurrent(this, p)
    this[GEA_ROUTER_REF] = null
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(this)); if (typeof proto?.dispose === 'function') proto.dispose.call(this)
  }
}

Object.defineProperty(RouterView.prototype, GEA_IS_ROUTER_OUTLET, {
  value: true,
  enumerable: false,
  configurable: true,
})

function _rebindRouter(view: RouterView, p: RouterViewPrivate, router: any): void {
  for (const remove of p.observerRemovers) {
    remove()
  }
  p.observerRemovers = []
  view[GEA_ROUTER_REF] = router

  const removePath = router.observe('path', () => _updateView(view, rvp(view)))
  const removeError = router.observe('error', () => _updateView(view, rvp(view)))
  const removeQuery = router.observe('query', () => _updateView(view, rvp(view)))
  p.observerRemovers.push(removePath, removeError, removeQuery)
}

function _clearCurrent(view: RouterView, p: RouterViewPrivate): void {
  if (p.currentChild) {
    if (typeof (p.currentChild as any).dispose === 'function') (p.currentChild as any).dispose()
    p.currentChild = null
    ;(view as any)[GEA_CHILD_COMPONENTS] = []
  }
  p.currentComponentClass = null
  p.lastCacheKey = null
}

function _isClassComponent(comp: any): boolean {
  return typeof comp === 'function' && (typeof comp.prototype?.[GEA_CREATE_TEMPLATE] === 'function')
}

function _updateView(view: RouterView, p: RouterViewPrivate): void {
  const el = (view as any).el
  if (!el) return

  const router = view.props?.router ?? view[GEA_ROUTER_REF] ?? Outlet._router
  if (!router) return

  if (p.currentChild && p.currentChild.el && !el.contains(p.currentChild.el)) {
    _clearCurrent(view, p)
  }

  const item = router.getComponentAtDepth(0)

  if (!item) {
    _clearCurrent(view, p)
    return
  }

  const isLeaf = 0 >= router.layoutCount
  const isSameComponent = p.currentComponentClass === item.component

  if (isSameComponent && !isLeaf) {
    if (item.cacheKey === null || item.cacheKey === p.lastCacheKey) {
      return
    }
  }

  if (isSameComponent && isLeaf && router.path === p.lastPath) {
    return
  }

  _clearCurrent(view, p)

  while (el.firstChild) el.removeChild(el.firstChild)

  if (_isClassComponent(item.component)) {
    const child = new item.component()
    ;(child as any)[GEA_PARENT_COMPONENT] = view
    if (item.props) {
      // Convert props to thunks for v2 Component
      const thunks: Record<string, () => unknown> = {}
      for (const [k, v] of Object.entries(item.props)) {
        thunks[k] = () => v
      }
      child[GEA_SET_PROPS](thunks)
    }
    child.render(el)
    p.currentChild = child
    p.currentComponentClass = item.component
  }

  p.lastCacheKey = item.cacheKey
  p.lastPath = router.path
}
