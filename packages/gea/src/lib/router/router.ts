import { Store } from '../store'
import type { RouteMap, RouterOptions, NavigationTarget, RouteComponent, ResolvedRoute } from './types'
import { resolveRoute } from './resolve'
import { runGuards } from './guard'
import { resolveLazy } from './lazy'
import { parseQuery } from './query'
import Link from './link'
import Outlet from './outlet'

function buildUrl(target: string | NavigationTarget): { path: string; search: string; hash: string } {
  if (typeof target === 'string') {
    // Parse path?query#hash from string
    let path = target
    let search = ''
    let hash = ''

    const hashIdx = path.indexOf('#')
    if (hashIdx !== -1) {
      hash = path.slice(hashIdx)
      path = path.slice(0, hashIdx)
    }

    const qIdx = path.indexOf('?')
    if (qIdx !== -1) {
      search = path.slice(qIdx)
      path = path.slice(0, qIdx)
    }

    return { path, search, hash }
  }

  // NavigationTarget object
  let search = ''
  if (target.query) {
    const parts: string[] = []
    for (const [key, val] of Object.entries(target.query)) {
      if (Array.isArray(val)) {
        for (const v of val) {
          parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
        }
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
      }
    }
    if (parts.length > 0) search = '?' + parts.join('&')
  }

  const hash = target.hash ? (target.hash.startsWith('#') ? target.hash : '#' + target.hash) : ''

  return { path: target.path, search, hash }
}

export class Router<T extends RouteMap = RouteMap> extends Store {
  static _ssrRouterResolver: (() => object | null) | null = null
  readonly routeConfig: T
  // Reactive class fields (tracked by Store proxy)
  path = ''
  route = ''
  params: Record<string, string> = {}
  query: Record<string, string | string[]> = {}
  hash = ''
  matches: string[] = []
  error: string | null = null

  // Private fields (bypass Store reactivity via _ prefix)
  private _routes: RouteMap
  private _options: { base: string; scroll: boolean }
  private _currentComponent: any = null
  private _guardComponent: any = null
  private _guardProceed: (() => void) | null = null
  private _popstateHandler: ((e: PopStateEvent) => void) | null = null
  private _clickHandler: ((e: MouseEvent) => void) | null = null
  private _scrollPositions = new Map<number, { x: number; y: number }>()
  private _historyIndex = 0
  private _queryModes = new Map<number, any>()
  private _layouts: any[] = []

  constructor(routes?: T, options?: RouterOptions) {
    super()

    this.routeConfig = (routes ?? {}) as T
    this._routes = routes ?? {}
    this._options = {
      base: options?.base ?? '',
      scroll: options?.scroll ?? false,
    }

    Link._router = this
    Outlet._router = this

    this._popstateHandler = (_e: PopStateEvent) => {
      this._resolve()
    }
    window.addEventListener('popstate', this._popstateHandler)

    this._clickHandler = (e: MouseEvent) => {
      if (e.defaultPrevented) return
      const anchor = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href) return
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return
      if (anchor.hasAttribute('download') || anchor.getAttribute('target') === '_blank') return
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return

      e.preventDefault()
      this.push(href)
    }
    document.addEventListener('click', this._clickHandler)

    // Sync reactive path/params from the current URL even when no routes are registered
    // yet (lazy singleton). Without this, `router.path` stays "" and apps that redirect
    // based on it can clobber deep links on first load.
    this._resolve()
  }

  setRoutes(routes: RouteMap): void {
    this._routes = routes
    ;(this as any).routeConfig = routes
    if (typeof window !== 'undefined') this._resolve()
  }

  get page(): any {
    return this._guardComponent ?? this._currentComponent
  }

  push(target: string | NavigationTarget): void {
    this._navigate(target, 'push')
  }

  navigate(target: string | NavigationTarget): void {
    this.push(target)
  }

  replace(target: string | NavigationTarget): void {
    this._navigate(target, 'replace')
  }

  back(): void {
    if (typeof window !== 'undefined') window.history.back()
  }

  forward(): void {
    if (typeof window !== 'undefined') window.history.forward()
  }

  go(delta: number): void {
    if (typeof window !== 'undefined') window.history.go(delta)
  }

  get layoutCount(): number {
    return this._layouts.length
  }

  getComponentAtDepth(depth: number): { component: any; props: Record<string, any>; cacheKey: string | null } | null {
    if (depth < this._layouts.length) {
      const layout = this._layouts[depth]
      const props: Record<string, any> = { ...this.params }
      props.route = this.route

      const nextDepth = depth + 1
      if (nextDepth < this._layouts.length) {
        props.page = this._layouts[nextDepth]
      } else {
        props.page = this._guardComponent ?? this._currentComponent
      }

      let cacheKey: string | null = null
      const modeInfo = this._queryModes.get(depth)
      if (modeInfo) {
        props.activeKey = modeInfo.activeKey
        props.keys = modeInfo.keys
        props.navigate = (key: string) => {
          const sp = new URLSearchParams(window.location.search)
          sp.set(modeInfo.param, key)
          this.replace({ path: this.path, query: Object.fromEntries(sp) })
        }
        cacheKey = modeInfo.activeKey
      }
      return { component: layout, props, cacheKey }
    }
    if (depth === this._layouts.length) {
      const comp = this._guardComponent ?? this._currentComponent
      return comp ? { component: comp, props: { ...this.params }, cacheKey: null } : null
    }
    return null
  }

  isActive(path: string): boolean {
    if (path === '/') return this.path === '/'
    return this.path === path || this.path.startsWith(path + '/')
  }

  isExact(path: string): boolean {
    return this.path === path
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      if (this._popstateHandler) {
        window.removeEventListener('popstate', this._popstateHandler)
        this._popstateHandler = null
      }
      if (this._clickHandler) {
        document.removeEventListener('click', this._clickHandler)
        this._clickHandler = null
      }
    }
  }

  private _navigate(target: string | NavigationTarget, method: 'push' | 'replace'): void {
    if (typeof window === 'undefined') return
    const { path, search, hash } = buildUrl(target)

    // Prepend base for the history API URL
    const base = this._options.base
    const fullPath = base + path + search + hash

    // Save scroll position before navigation
    if (this._options.scroll && method === 'push') {
      this._scrollPositions.set(this._historyIndex, {
        x: window.scrollX ?? 0,
        y: window.scrollY ?? 0,
      })
    }

    if (method === 'push') {
      this._historyIndex++
      window.history.pushState({ index: this._historyIndex }, '', fullPath)
    } else {
      window.history.replaceState({ index: this._historyIndex }, '', fullPath)
    }

    this._resolve()

    // Scroll to top on push navigation if scroll enabled
    if (this._options.scroll && method === 'push') {
      window.scrollTo(0, 0)
    }
  }

  private _resolve(): void {
    if (typeof window === 'undefined') return
    const base = this._options.base
    let currentPath = window.location.pathname
    const currentSearch = window.location.search
    const currentHash = window.location.hash

    // Strip base from path
    if (base && currentPath.startsWith(base)) {
      currentPath = currentPath.slice(base.length) || '/'
    }

    const resolved: ResolvedRoute = resolveRoute(this._routes, currentPath, currentSearch)

    // Handle redirect
    if (resolved.redirect) {
      const redirectMethod = resolved.redirectMethod ?? 'replace'
      this._navigate(resolved.redirect, redirectMethod)
      return
    }

    // Handle guards
    if (resolved.guards.length > 0) {
      const guardResult = runGuards(resolved.guards)

      if (guardResult !== true) {
        if (typeof guardResult === 'string') {
          // Guard redirects to another path
          this._navigate(guardResult, 'replace')
          return
        }

        // Guard returned a component — block navigation, show guard component
        this._guardComponent = guardResult
        this._guardProceed = () => {
          this._guardComponent = null
          this._guardProceed = null
          this._applyResolved(resolved, currentPath, currentSearch, currentHash)
        }

        // Still update path-related reactive fields
        this.path = currentPath
        this.route = resolved.pattern
        this.params = resolved.params
        this.query = parseQuery(currentSearch)
        this.hash = currentHash
        this.matches = resolved.matches
        return
      }
    }

    // Handle lazy loading
    if (resolved.isLazy && resolved.lazyLoader) {
      const loader = resolved.lazyLoader
      resolveLazy(loader)
        .then((component: RouteComponent) => {
          resolved.component = component
          this._applyResolved(resolved, currentPath, currentSearch, currentHash)
        })
        .catch((err: Error) => {
          this.error = err?.message ?? 'Failed to load route component'
          this._currentComponent = null
          this._guardComponent = null
          // Still update path info
          this.path = currentPath
          this.route = resolved.pattern
          this.params = resolved.params
          this.query = parseQuery(currentSearch)
          this.hash = currentHash
          this.matches = resolved.matches
        })

      // Update path info immediately while loading
      this.path = currentPath
      this.route = resolved.pattern
      this.params = resolved.params
      this.query = parseQuery(currentSearch)
      this.hash = currentHash
      this.matches = resolved.matches
      return
    }

    this._applyResolved(resolved, currentPath, currentSearch, currentHash)
  }

  private _applyResolved(
    resolved: ResolvedRoute,
    currentPath: string,
    currentSearch: string,
    currentHash: string,
  ): void {
    this._guardComponent = null
    this._currentComponent = resolved.component
    this._layouts = resolved.layouts
    this._queryModes = resolved.queryModes
    this.error = null

    // Update reactive fields
    this.path = currentPath
    this.route = resolved.pattern
    this.params = resolved.params
    this.query = parseQuery(currentSearch)
    this.hash = currentHash
    this.matches = resolved.matches
  }
}

/** @deprecated Use Router instead */
export const GeaRouter = Router
