import { Store } from '../store'
import type { RouteMap, RouterOptions, NavigationTarget, RouteComponent, ResolvedRoute } from './types'
import { resolveRoute } from './resolve'
import { runGuards } from './guard'
import { resolveLazy } from './lazy'
import { parseQuery } from './query'
import { clearDefaultRouter, getSSRRouterResolver, setDefaultRouter, setSSRRouterResolver } from './context'

function stripQueryHash(path: string): string {
  const q = path.indexOf('?')
  if (q !== -1) path = path.slice(0, q)
  const h = path.indexOf('#')
  if (h !== -1) path = path.slice(0, h)
  return path
}

function buildUrl(target: string | NavigationTarget): { path: string; search: string; hash: string } {
  if (typeof target === 'string') {
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

interface RouterPrivate {
  routes: RouteMap
  options: { base: string; scroll: boolean }
  currentComponent: any
  guardComponent: any
  guardProceed: (() => void) | null
  popstateHandler: ((e: PopStateEvent) => void) | null
  clickHandler: ((e: MouseEvent) => void) | null
  scrollPositions: Map<number, { x: number; y: number }>
  historyIndex: number
  queryModes: Map<number, any>
  layouts: any[]
}

const ROUTER_PRIVATE = Symbol('gea.router.private')

function rp(router: Router): RouterPrivate {
  return (router as any)[ROUTER_PRIVATE]
}

export class Router<T extends RouteMap = RouteMap> extends Store {
  static get _ssrRouterResolver(): (() => object | null) | null {
    return getSSRRouterResolver()
  }

  static set _ssrRouterResolver(resolver: (() => object | null) | null) {
    setSSRRouterResolver(resolver)
  }

  readonly routeConfig: T
  path = ''
  route = ''
  params: Record<string, string> = {}
  query: Record<string, string | string[]> = {}
  hash = ''
  matches: string[] = []
  error: string | null = null

  constructor(routes?: T, options?: RouterOptions) {
    super()

    this.routeConfig = (routes ?? {}) as T

    const p: RouterPrivate = {
      routes: routes ?? {},
      options: { base: options?.base ?? '', scroll: options?.scroll ?? false },
      currentComponent: null,
      guardComponent: null,
      guardProceed: null,
      popstateHandler: null,
      clickHandler: null,
      scrollPositions: new Map(),
      historyIndex: 0,
      queryModes: new Map(),
      layouts: [],
    }
    ;(this as any)[ROUTER_PRIVATE] = p
    setDefaultRouter(this)

    p.popstateHandler = (_e: PopStateEvent) => {
      _resolve(this)
    }
    window.addEventListener('popstate', p.popstateHandler)

    p.clickHandler = (e: MouseEvent) => {
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
    document.addEventListener('click', p.clickHandler)

    _resolve(this)
  }

  setRoutes(routes: RouteMap): void {
    rp(this).routes = routes
    ;(this as any).routeConfig = routes
    if (typeof window !== 'undefined') _resolve(this)
  }

  get page(): any {
    const p = rp(this)
    return p.guardComponent ?? p.currentComponent
  }

  push(target: string | NavigationTarget): void {
    _navigate(this, target, 'push')
  }

  navigate(target: string | NavigationTarget): void {
    this.push(target)
  }

  replace(target: string | NavigationTarget): void {
    _navigate(this, target, 'replace')
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
    return rp(this).layouts.length
  }

  getComponentAtDepth(depth: number): { component: any; props: Record<string, any>; cacheKey: string | null } | null {
    const p = rp(this)
    if (depth < p.layouts.length) {
      const layout = p.layouts[depth]
      const props: Record<string, any> = { ...this.params }
      props.route = this.route

      const nextDepth = depth + 1
      if (nextDepth < p.layouts.length) {
        props.page = p.layouts[nextDepth]
      } else {
        props.page = p.guardComponent ?? p.currentComponent
      }

      let cacheKey: string | null = null
      const modeInfo = p.queryModes.get(depth)
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
    if (depth === p.layouts.length) {
      const comp = p.guardComponent ?? p.currentComponent
      return comp ? { component: comp, props: { ...this.params }, cacheKey: null } : null
    }
    return null
  }

  isActive(path: string): boolean {
    const p = stripQueryHash(path)
    if (p === '/') return this.path === '/'
    return this.path === p || this.path.startsWith(p + '/')
  }

  isExact(path: string): boolean {
    return this.path === stripQueryHash(path)
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      const p = rp(this)
      if (p.popstateHandler) {
        window.removeEventListener('popstate', p.popstateHandler)
        p.popstateHandler = null
      }
      if (p.clickHandler) {
        document.removeEventListener('click', p.clickHandler)
        p.clickHandler = null
      }
    }
    clearDefaultRouter(this)
  }
}

function _navigate(router: Router, target: string | NavigationTarget, method: 'push' | 'replace'): void {
  if (typeof window === 'undefined') return
  const p = rp(router)
  const { path, search, hash } = buildUrl(target)

  const base = p.options.base
  const fullPath = base + path + search + hash

  if (method === 'push') {
    const currentFull = window.location.pathname + window.location.search + window.location.hash
    if (currentFull === fullPath) return
  }

  if (p.options.scroll && method === 'push') {
    p.scrollPositions.set(p.historyIndex, {
      x: window.scrollX ?? 0,
      y: window.scrollY ?? 0,
    })
  }

  if (method === 'push') {
    p.historyIndex++
    window.history.pushState({ index: p.historyIndex }, '', fullPath)
  } else {
    window.history.replaceState({ index: p.historyIndex }, '', fullPath)
  }

  _resolve(router)

  if (p.options.scroll && method === 'push') {
    window.scrollTo(0, 0)
  }
}

function _resolve(router: Router): void {
  if (typeof window === 'undefined') return
  const p = rp(router)
  const base = p.options.base
  let currentPath = window.location.pathname
  const currentSearch = window.location.search
  const currentHash = window.location.hash

  if (base && currentPath.startsWith(base)) {
    currentPath = currentPath.slice(base.length) || '/'
  }

  const resolved: ResolvedRoute = resolveRoute(p.routes, currentPath, currentSearch)

  if (resolved.redirect) {
    const redirectMethod = resolved.redirectMethod ?? 'replace'
    _navigate(router, resolved.redirect, redirectMethod)
    return
  }

  if (resolved.guards.length > 0) {
    const guardResult = runGuards(resolved.guards)

    if (guardResult !== true) {
      if (typeof guardResult === 'string') {
        _navigate(router, guardResult, 'replace')
        return
      }

      p.guardComponent = guardResult
      p.guardProceed = () => {
        p.guardComponent = null
        p.guardProceed = null
        _applyResolved(router, resolved, currentPath, currentSearch, currentHash)
      }

      router.path = currentPath
      router.route = resolved.pattern
      router.params = resolved.params
      router.query = parseQuery(currentSearch)
      router.hash = currentHash
      router.matches = resolved.matches
      return
    }
  }

  if (resolved.isLazy && resolved.lazyLoader) {
    const loader = resolved.lazyLoader
    resolveLazy(loader)
      .then((component: RouteComponent) => {
        resolved.component = component
        _applyResolved(router, resolved, currentPath, currentSearch, currentHash)
      })
      .catch((err: Error) => {
        router.error = err?.message ?? 'Failed to load route component'
        p.currentComponent = null
        p.guardComponent = null
        router.path = currentPath
        router.route = resolved.pattern
        router.params = resolved.params
        router.query = parseQuery(currentSearch)
        router.hash = currentHash
        router.matches = resolved.matches
      })

    router.path = currentPath
    router.route = resolved.pattern
    router.params = resolved.params
    router.query = parseQuery(currentSearch)
    router.hash = currentHash
    router.matches = resolved.matches
    return
  }

  _applyResolved(router, resolved, currentPath, currentSearch, currentHash)
}

function _applyResolved(
  router: Router,
  resolved: ResolvedRoute,
  currentPath: string,
  currentSearch: string,
  currentHash: string,
): void {
  const p = rp(router)
  p.guardComponent = null
  p.currentComponent = resolved.component
  p.layouts = resolved.layouts
  p.queryModes = resolved.queryModes
  router.error = null

  router.path = currentPath
  router.route = resolved.pattern
  router.params = resolved.params
  router.query = parseQuery(currentSearch)
  router.hash = currentHash
  router.matches = resolved.matches
}

/** @deprecated Use Router instead */
export const GeaRouter = Router
