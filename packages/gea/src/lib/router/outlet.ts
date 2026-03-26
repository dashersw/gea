import Component from '../base/component'
import type { Router } from './router'

export default class Outlet extends Component<{ router?: Router | null }> {
  static _router: Router | null = null

  __isRouterOutlet = true
  _routerDepth = -1

  private _router: Router | null = null
  private _currentChild: Component | null = null
  private _currentComponentClass: any = null
  private _lastCacheKey: string | null = null
  private _observerRemovers: Array<() => void> = []

  template() {
    return `<div id="${this.id}"></div>` as any
  }

  private _computeDepthAndRouter(): { depth: number; router: Router | null } {
    let depth = 0
    let router: Router | null = null
    let parent: any = this.parentComponent
    while (parent) {
      if (parent.__isRouterOutlet) {
        depth = parent._routerDepth + 1
        router = parent._router ?? parent.props?.router ?? null
        break
      }
      parent = parent.parentComponent
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
      child.parentComponent = this
      child.render(this.el)
      if (child.element_) {
        ;(child.element_ as any).__geaCompiledChildRoot = true
      }
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
    super.dispose()
  }
}
