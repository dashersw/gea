import { Component } from '../component/component.js'
import {
  engineThis,
  GEA_CHILD_COMPONENTS,
  GEA_CREATE_TEMPLATE,
  GEA_DOM_COMPILED_CHILD_ROOT,
  GEA_SET_PROPS,
  GEA_ELEMENT,
  GEA_IS_ROUTER_OUTLET,
  GEA_PARENT_COMPONENT,
  GEA_ROUTER_DEPTH,
  GEA_ROUTER_REF,
} from '../symbols.js'
import type { Router } from './router'

interface OutletPrivate {
  currentChild: Component | null
  currentComponentClass: any
  lastCacheKey: string | null
  lastPath: string | undefined
  observerRemovers: Array<() => void>
}

const SYM_OP = Symbol.for('gea.outlet.private')

function op(outlet: Outlet): OutletPrivate {
  let p = (outlet as any)[SYM_OP]
  if (!p) {
    p = {
      currentChild: null,
      currentComponentClass: null,
      lastCacheKey: null,
      lastPath: undefined,
      observerRemovers: [],
    }
    ;(outlet as any)[SYM_OP] = p
  }
  return p
}

export default class Outlet extends Component {
  static _router: any = null;
  [GEA_ROUTER_DEPTH]: number = -1;
  [GEA_ROUTER_REF]: any = null

  override [GEA_CREATE_TEMPLATE]() {
    const el = document.createElement('div')
    el.id = this.id
    return el
  }

  onAfterRender() {
    const p = op(this)
    const { depth, router } = _computeDepthAndRouter(this)
    this[GEA_ROUTER_DEPTH] = depth

    if (router && router !== this[GEA_ROUTER_REF]) {
      for (const remove of p.observerRemovers) remove()
      p.observerRemovers = []
      this[GEA_ROUTER_REF] = router
    }

    if (p.observerRemovers.length === 0 && this[GEA_ROUTER_REF]) {
      const r = this[GEA_ROUTER_REF]
      const removePath = r.observe('path', () => _updateView(this, op(this)))
      const removeError = r.observe('error', () => _updateView(this, op(this)))
      const removeQuery = r.observe('query', () => _updateView(this, op(this)))
      p.observerRemovers.push(removePath, removeError, removeQuery)
    }
    _updateView(this, p)
  }

  dispose() {
    const p = op(this)
    for (const remove of p.observerRemovers) {
      remove()
    }
    p.observerRemovers = []
    _clearCurrent(this, p)
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(this)); if (typeof proto?.dispose === 'function') proto.dispose.call(this)
  }
}

Object.defineProperty(Outlet.prototype, GEA_IS_ROUTER_OUTLET, {
  value: true,
  enumerable: false,
  configurable: true,
})

function _computeDepthAndRouter(outlet: Outlet): { depth: number; router: any } {
  let depth = 0
  let router: any = null
  let parent: any = engineThis(outlet)[GEA_PARENT_COMPONENT]
  while (parent) {
    if (parent[GEA_IS_ROUTER_OUTLET]) {
      depth = parent[GEA_ROUTER_DEPTH] + 1
      router = parent[GEA_ROUTER_REF] ?? parent.props?.router ?? null
      break
    }
    parent = engineThis(parent)[GEA_PARENT_COMPONENT]
  }
  if (!router) router = Outlet._router
  return { depth, router }
}

function _clearCurrent(outlet: Outlet, p: OutletPrivate): void {
  if (p.currentChild) {
    if (typeof (p.currentChild as any).dispose === 'function') (p.currentChild as any).dispose()
    p.currentChild = null
    ;(outlet as any)[GEA_CHILD_COMPONENTS] = []
  }
  p.currentComponentClass = null
  p.lastCacheKey = null
}

function _isClassComponent(comp: any): boolean {
  return typeof comp === 'function' && typeof comp.prototype?.[GEA_CREATE_TEMPLATE] === 'function'
}

function _updateView(outlet: Outlet, p: OutletPrivate): void {
  const el = (outlet as any).el
  if (!el) return

  const router = (outlet as any)[GEA_ROUTER_REF] ?? outlet.props?.router ?? Outlet._router
  if (!router) return

  if (p.currentChild && p.currentChild.el && !el.contains(p.currentChild.el)) {
    _clearCurrent(outlet, p)
  }

  const depth = (outlet as any)[GEA_ROUTER_DEPTH]
  const item = router.getComponentAtDepth(depth)

  if (!item) {
    _clearCurrent(outlet, p)
    return
  }

  const isLeaf = depth >= router.layoutCount
  const isSameComponent = p.currentComponentClass === item.component

  if (isSameComponent && !isLeaf) {
    if (item.cacheKey === null || item.cacheKey === p.lastCacheKey) {
      return
    }
  }

  if (isSameComponent && isLeaf) {
    p.lastCacheKey = item.cacheKey
    p.lastPath = router.path
    return
  }

  _clearCurrent(outlet, p)

  if (_isClassComponent(item.component)) {
    const child = new item.component()
    ;(child as any)[GEA_PARENT_COMPONENT] = outlet
    if (item.props) {
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
