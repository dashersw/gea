import Component from '../base/component'
import { engineThis } from '../base/component-internal'
import {
  GEA_CHILD_COMPONENTS,
  GEA_DOM_COMPILED_CHILD_ROOT,
  GEA_ELEMENT,
  GEA_IS_ROUTER_OUTLET,
  GEA_PARENT_COMPONENT,
  GEA_PROXY_RAW,
  GEA_ROUTER_DEPTH,
  GEA_ROUTER_REF,
} from '../symbols'
import type { Router } from './router'

interface OutletPrivate {
  currentChild: Component | null
  currentComponentClass: any
  lastCacheKey: string | null
  lastPath: string | undefined
  observerRemovers: Array<() => void>
}

const _op = new WeakMap<object, OutletPrivate>()

function rawOutlet(o: Outlet): object {
  return (o as any)[GEA_PROXY_RAW] ?? o
}

function op(outlet: Outlet): OutletPrivate {
  const key = rawOutlet(outlet)
  let p = _op.get(key)
  if (!p) {
    p = {
      currentChild: null,
      currentComponentClass: null,
      lastCacheKey: null,
      lastPath: undefined,
      observerRemovers: [],
    }
    _op.set(key, p)
  }
  return p
}

export default class Outlet extends Component<{ router?: Router | null }> {
  static _router: Router | null = null;
  [GEA_ROUTER_DEPTH]: number = -1;
  [GEA_ROUTER_REF]: Router | null = null

  template() {
    return `<div id="${this.id}"></div>` as any
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
    super.dispose()
  }
}

Object.defineProperty(Outlet.prototype, GEA_IS_ROUTER_OUTLET, {
  value: true,
  enumerable: false,
  configurable: true,
})

function _computeDepthAndRouter(outlet: Outlet): { depth: number; router: Router | null } {
  let depth = 0
  let router: Router | null = null
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
    p.currentChild.dispose()
    p.currentChild = null
    outlet[GEA_CHILD_COMPONENTS] = []
  }
  p.currentComponentClass = null
  p.lastCacheKey = null
}

function _isClassComponent(comp: any): boolean {
  if (!comp || typeof comp !== 'function') return false
  let proto = comp.prototype
  while (proto) {
    if (proto === Component.prototype) return true
    proto = Object.getPrototypeOf(proto)
  }
  return false
}

function _updateView(outlet: Outlet, p: OutletPrivate): void {
  if (!outlet.el) return

  const router = outlet[GEA_ROUTER_REF] ?? outlet.props?.router ?? Outlet._router
  if (!router) return

  if (
    p.currentChild &&
    (!engineThis(p.currentChild)[GEA_ELEMENT] || !outlet.el.contains(engineThis(p.currentChild)[GEA_ELEMENT]))
  ) {
    _clearCurrent(outlet, p)
  }

  const depth = outlet[GEA_ROUTER_DEPTH]
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
    const child = new item.component(item.props)
    engineThis(child)[GEA_PARENT_COMPONENT] = outlet
    child.render(outlet.el)
    if (engineThis(child)[GEA_ELEMENT]) {
      ;(engineThis(child)[GEA_ELEMENT] as any)[GEA_DOM_COMPILED_CHILD_ROOT] = true
    }
    p.currentChild = child
    p.currentComponentClass = item.component
    outlet[GEA_CHILD_COMPONENTS] = [child]
  }

  p.lastCacheKey = item.cacheKey
  p.lastPath = router.path
}
