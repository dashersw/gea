import Component from '../base/component'
import {
  GEA_CHILD_COMPONENTS,
  GEA_DOM_COMPILED_CHILD_ROOT,
  GEA_ELEMENT,
  GEA_IS_ROUTER_OUTLET,
  GEA_PARENT_COMPONENT,
  GEA_PROXY_GET_RAW_TARGET,
} from '../symbols'
import type { Router } from './router'

function engineThis(c: object): any {
  return (c as any)[GEA_PROXY_GET_RAW_TARGET] ?? c
}

export default class Outlet extends Component<{ router?: Router | null }> {
  static _router: Router | null = null
  static _ssgHtml: string | null = null

  _routerDepth = -1

  private _router: Router | null = null
  private _currentChild: Component | null = null
  private _currentComponentClass: any = null
  private _lastCacheKey: string | null = null
  private _observerRemovers: Array<() => void> = []

  template() {
    if (Outlet._ssgHtml) {
      return `<div id="${this.id}">${Outlet._ssgHtml}</div>` as any
    }
    return `<div id="${this.id}"></div>` as any
  }

  private _computeDepthAndRouter(): { depth: number; router: Router | null } {
    let depth = 0
    let router: Router | null = null
    let parent: any = engineThis(this)[GEA_PARENT_COMPONENT]
    while (parent) {
      if (parent[GEA_IS_ROUTER_OUTLET]) {
        depth = parent._routerDepth + 1
        router = parent._router ?? parent.props?.router ?? null
        break
      }
      parent = engineThis(parent)[GEA_PARENT_COMPONENT]
    }
    if (!router) router = Outlet._router
    return { depth, router }
  }

  onAfterRender() {
    const { depth, router } = this._computeDepthAndRouter()
    this._routerDepth = depth

    if (router && router !== this._router) {
      for (const remove of this._observerRemovers) remove()
      this._observerRemovers = []
      this._router = router
    }

    if (this._observerRemovers.length === 0 && this._router) {
      const r = this._router
      const removePath = r.observe('path', () => this._updateView())
      const removeError = r.observe('error', () => this._updateView())
      const removeQuery = r.observe('query', () => this._updateView())
      this._observerRemovers.push(removePath, removeError, removeQuery)
    }
    this._updateView()
  }

  private _getRouter(): Router | null {
    return this._router ?? this.props?.router ?? Outlet._router
  }

  private _clearCurrent(): void {
    if (this._currentChild) {
      this._currentChild.dispose()
      this._currentChild = null
      this[GEA_CHILD_COMPONENTS] = []
    }
    this._currentComponentClass = null
    this._lastCacheKey = null
  }

  private _isClassComponent(comp: any): boolean {
    if (!comp || typeof comp !== 'function') return false
    let proto = comp.prototype
    while (proto) {
      if (proto === Component.prototype) return true
      proto = Object.getPrototypeOf(proto)
    }
    return false
  }

  private _updateView(): void {
    if (!this.el) return

    const router = this._getRouter()
    if (!router) return

    if (
      this._currentChild &&
      (!engineThis(this._currentChild)[GEA_ELEMENT] || !this.el.contains(engineThis(this._currentChild)[GEA_ELEMENT]))
    ) {
      this._clearCurrent()
    }

    const depth = this._routerDepth
    const item = router.getComponentAtDepth(depth)

    if (!item) {
      this._clearCurrent()
      return
    }

    const isLeaf = depth >= router.layoutCount
    const isSameComponent = this._currentComponentClass === item.component

    if (isSameComponent && !isLeaf) {
      if (item.cacheKey === null || item.cacheKey === this._lastCacheKey) {
        return
      }
    }

    if (isSameComponent && isLeaf) {
      this._lastCacheKey = item.cacheKey
      ;(this as any)._lastPath = router.path
      return
    }

    this._clearCurrent()

    if (this._isClassComponent(item.component)) {
      const child = new item.component(item.props)
      engineThis(child)[GEA_PARENT_COMPONENT] = this
      child.render(this.el)
      if (engineThis(child)[GEA_ELEMENT]) {
        ;(engineThis(child)[GEA_ELEMENT] as any)[GEA_DOM_COMPILED_CHILD_ROOT] = true
      }
      this._currentChild = child
      this._currentComponentClass = item.component
      this[GEA_CHILD_COMPONENTS] = [child]
    }

    this._lastCacheKey = item.cacheKey
    ;(this as any)._lastPath = router.path
  }

  dispose() {
    for (const remove of this._observerRemovers) {
      remove()
    }
    this._observerRemovers = []
    this._clearCurrent()
    super.dispose()
  }
}

Object.defineProperty(Outlet.prototype, GEA_IS_ROUTER_OUTLET, {
  value: true,
  enumerable: false,
  configurable: true,
})
