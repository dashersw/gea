import { AsyncLocalStorage } from 'node:async_hooks'
import type { GeaComponentConstructor } from './types'
import type { ServerRouteResult, ServerRouteQueryMode } from './server-router'

interface RouteHostItem {
  component: GeaComponentConstructor
  props: Record<string, unknown>
  cacheKey: string | null
}

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
  observe: (path: unknown, fn: unknown) => () => void
  getComponentAtDepth: (depth: number) => RouteHostItem | null
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
  const layouts = routeResult.layouts ?? []
  const queryModes = routeResult.queryModes ?? new Map<number, ServerRouteQueryMode>()
  const layoutCount = layouts.length
  const leaf = routeResult.component

  return {
    path: routeResult.path,
    route: routeResult.route,
    params: routeResult.params,
    query: routeResult.query,
    hash: routeResult.hash,
    matches: routeResult.matches,
    error: null,
    routeConfig: {},
    page: leaf,
    layoutCount,

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
    // RouterView/Outlet subscribe to router.path/error/query via `observe` —
    // on the server there are no subsequent changes to observe, so return a
    // noop unsubscribe. Without this stub the subscription throws and the
    // surrounding onAfterRender aborts before the view is mounted.
    observe(_path: unknown, _fn: unknown) {
      return noop
    },
    // Mirror client Router.getComponentAtDepth so RouterView/Outlet mount the
    // full layout chain during SSR. Layouts at `depth < layoutCount`, leaf at
    // `depth === layoutCount`.
    getComponentAtDepth(depth: number): RouteHostItem | null {
      if (depth < layoutCount) {
        const layout = layouts[depth]
        const props: Record<string, unknown> = { ...routeResult.params }
        props.route = routeResult.route

        const nextDepth = depth + 1
        if (nextDepth < layoutCount) {
          props.page = layouts[nextDepth]
        } else {
          props.page = leaf
        }

        let cacheKey: string | null = null
        const modeInfo = queryModes.get(depth)
        if (modeInfo) {
          props.activeKey = modeInfo.activeKey
          props.keys = modeInfo.keys
          // Navigation is meaningless during SSR — provide a noop so layouts
          // that destructure `navigate` don't throw.
          props.navigate = noop
          cacheKey = modeInfo.activeKey
        }
        return { component: layout, props, cacheKey }
      }
      if (depth === layoutCount && leaf) {
        return { component: leaf, props: { ...routeResult.params }, cacheKey: null }
      }
      return null
    },
  }
}
