import Component from '../base/component'
import type { Router } from './router'
import type { RouteMap } from './types'
import Outlet from './outlet'

export default class RouterView extends Component<{ router?: Router; routes?: RouteMap }> {
  __isRouterOutlet = true
  _routerDepth = 0

  private _router: Router | null = null
  private _currentChild: Component | null = null
  private _currentComponentClass: any = null
  private _lastCacheKey: string | null = null
  private _observerRemovers: Array<() => void> = []
  private _routesApplied = false

  template() {
    return `<div id="${this.id}"></div>` as any
  }

  private _getRouter(): Router | null {
    return this.props?.router ?? this._router ?? Outlet._router
  }

  private _rebindRouter(router: Router): void {
    for (const remove of this._observerRemovers) {
      remove()
    }
    this._observerRemovers = []
    this._router = router

    const removePath = router.observe('path', () => this._updateView())
    const removeError = router.observe('error', () => this._updateView())
    const removeQuery = router.observe('query', () => this._updateView())
    this._observerRemovers.push(removePath, removeError, removeQuery)
  }

  onAfterRender() {
    const router = this._getRouter()
    if (!router) return

    if (this.props?.routes && !this._routesApplied) {
      router.setRoutes(this.props.routes)
      this._routesApplied = true
    }

    if (router !== this._router) {
      this._rebindRouter(router)
    } else if (this._observerRemovers.length === 0) {
      this._rebindRouter(router)
    }

    this._updateView()
  }

  private _clearCurrent(): void {
    if (this._currentChild) {
      this._currentChild.dispose()
      this._currentChild = null
      this.__childComponents = []
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

    if (this._currentChild && (!this._currentChild.element_ || !this.el.contains(this._currentChild.element_))) {
      this._clearCurrent()
    }

    const item = router.getComponentAtDepth(0)

    if (!item) {
      this._clearCurrent()
      return
    }

    const isLeaf = 0 >= router.layoutCount
    const isSameComponent = this._currentComponentClass === item.component

    if (isSameComponent && !isLeaf) {
      if (item.cacheKey === null || item.cacheKey === this._lastCacheKey) {
        return
      }
    }

    if (isSameComponent && isLeaf && router.path === (this as any)._lastPath) {
      return
    }

    this._clearCurrent()

    // Remove any orphaned DOM that _clearCurrent couldn't track
    // (e.g., route content rendered during SSR hydration before
    // _currentChild was established)
    while (this.el.firstChild) this.el.removeChild(this.el.firstChild)

    if (this._isClassComponent(item.component)) {
      const child = new item.component(item.props)
      child.parentComponent = this
      child.render(this.el)
      this._currentChild = child
      this._currentComponentClass = item.component
      this.__childComponents = [child]
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
    this._router = null
    super.dispose()
  }
}
