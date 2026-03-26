import { AsyncLocalStorage } from 'node:async_hooks'
import type { ServerRouteResult } from './server-router'

interface SSRRouterState {
  path: string
  route: string
  params: Record<string, string>
  query: Record<string, string | string[]>
  hash: string
  matches: string[]
  error: null
  routeConfig: Record<string, unknown>
  page: unknown
  layoutCount: number
  isActive: (p: string) => boolean
  isExact: (p: string) => boolean
  push: (...args: unknown[]) => void
  replace: (...args: unknown[]) => void
  back: () => void
  forward: () => void
  go: (delta: number) => void
  navigate: (...args: unknown[]) => void
  dispose: () => void
  setRoutes: (...args: unknown[]) => void
  getComponentAtDepth: () => null
}

const ssrRouterContext = new AsyncLocalStorage<SSRRouterState>()

export function resolveSSRRouter(): SSRRouterState | null {
  return ssrRouterContext.getStore() ?? null
}

export function runWithSSRRouter<T>(state: object, fn: () => T): T {
  return ssrRouterContext.run(state as SSRRouterState, fn)
}

export function createSSRRouterState(routeResult: ServerRouteResult): SSRRouterState {
  const noop = () => {}
  return {
    path: routeResult.path,
    route: routeResult.route,
    params: routeResult.params,
    query: routeResult.query,
    hash: routeResult.hash,
    matches: routeResult.matches,
    error: null,
    routeConfig: {},
    page: routeResult.component,
    layoutCount: 0,

    isActive(p: string): boolean {
      if (p === '/') return routeResult.path === '/'
      return routeResult.path === p || routeResult.path.startsWith(p + '/')
    },
    isExact(p: string): boolean {
      return routeResult.path === p
    },

    push: noop,
    replace: noop,
    back: noop,
    forward: noop,
    go: noop,
    navigate: noop,
    dispose: noop,
    setRoutes: noop,
    getComponentAtDepth: () => null,
  }
}
