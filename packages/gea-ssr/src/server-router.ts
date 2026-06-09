import type { GeaComponentConstructor, RouteMap } from './types'
import { isComponentConstructor, isRouteGroup } from './types'

export interface ServerRouteQueryMode {
  activeKey: string
  keys: string[]
  param: string
}

export interface ServerRouteResult {
  path: string
  route: string
  params: Record<string, string>
  query: Record<string, string | string[]>
  hash: string
  matches: string[]
  component: GeaComponentConstructor | null
  /** Layout chain from outermost to innermost. */
  layouts: GeaComponentConstructor[]
  /** Query-mode metadata keyed by layout depth (index into `layouts`). */
  queryModes: Map<number, ServerRouteQueryMode>
  guardRedirect: string | null
  isNotFound: boolean
}

function parseQuery(search: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {}
  if (!search) return result
  const params = new URLSearchParams(search)
  params.forEach((value, key) => {
    const existing = result[key]
    if (existing !== undefined) {
      result[key] = Array.isArray(existing) ? [...existing, value] : [existing, value]
    } else {
      result[key] = value
    }
  })
  return result
}

function matchRoute(pattern: string, path: string): { params: Record<string, string> } | null {
  if (pattern === '*') return { params: {} }

  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  if (patternParts.length !== pathParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i])
    } else if (patternParts[i] !== pathParts[i]) {
      return null
    }
  }
  return { params }
}

interface ResolvedRoute {
  route: string
  params: Record<string, string>
  component: GeaComponentConstructor | null
  matches: string[]
  guardRedirect: string | null
  layouts: GeaComponentConstructor[]
  queryModes: Map<number, ServerRouteQueryMode>
}

interface ResolveContext {
  query: Record<string, string | string[]>
  skipGuards: boolean
}

function resolveRoutes(
  routes: RouteMap,
  path: string,
  ctx: ResolveContext,
  parentMatches: string[] = [],
  parentLayouts: GeaComponentConstructor[] = [],
  parentQueryModes: Map<number, ServerRouteQueryMode> = new Map(),
): ResolvedRoute | null {
  for (const [pattern, entry] of Object.entries(routes)) {
    if (pattern === '*') continue

    // String redirect
    if (typeof entry === 'string') {
      const match = matchRoute(pattern, path)
      if (match) {
        return {
          route: pattern,
          params: match.params,
          component: null,
          matches: [...parentMatches, pattern],
          guardRedirect: entry,
          layouts: parentLayouts,
          queryModes: parentQueryModes,
        }
      }
      continue
    }

    // Route group with children
    if (isRouteGroup(entry)) {
      const patternParts = pattern.split('/').filter(Boolean)
      const pathParts = path.split('/').filter(Boolean)

      let prefixMatch = true
      const params: Record<string, string> = {}

      if (pattern === '/') {
        prefixMatch = true
      } else if (pathParts.length >= patternParts.length) {
        for (let i = 0; i < patternParts.length; i++) {
          if (patternParts[i].startsWith(':')) {
            params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i])
          } else if (patternParts[i] !== pathParts[i]) {
            prefixMatch = false
            break
          }
        }
      } else {
        prefixMatch = false
      }

      if (prefixMatch) {
        // Check guard (skip during SSR — guards may use browser-only APIs)
        if (entry.guard && !ctx.skipGuards) {
          const guardResult = entry.guard()
          if (guardResult !== true) {
            return {
              route: pattern,
              params,
              component: null,
              matches: [...parentMatches, pattern],
              guardRedirect: typeof guardResult === 'string' ? guardResult : null,
              layouts: parentLayouts,
              queryModes: parentQueryModes,
            }
          }
        }

        const layout = entry.layout ?? entry.component
        const layouts = layout ? [...parentLayouts, layout] : parentLayouts
        const queryModes = new Map(parentQueryModes)
        const groupMatches = [...parentMatches, pattern]

        // Query-mode group: pick child by `query[param]`, not by path segment.
        if (entry.mode?.type === 'query') {
          const childKeys = Object.keys(entry.children)
          const raw = ctx.query[entry.mode.param]
          const fromQuery = Array.isArray(raw) ? raw[0] : raw
          const activeKey = fromQuery && childKeys.includes(fromQuery) ? fromQuery : childKeys[0]

          if (layout) {
            queryModes.set(layouts.length - 1, {
              activeKey,
              keys: childKeys,
              param: entry.mode.param,
            })
          }

          const childEntry = childKeys.length > 0 ? entry.children[activeKey] : undefined
          if (isComponentConstructor(childEntry as any)) {
            return {
              route: pattern,
              params,
              component: childEntry as GeaComponentConstructor,
              matches: [...groupMatches, activeKey],
              guardRedirect: null,
              layouts,
              queryModes,
            }
          }
          // Active key didn't resolve to a component — render the layout with
          // no leaf so the chain still appears in the HTML.
          return {
            route: pattern,
            params,
            component: null,
            matches: groupMatches,
            guardRedirect: null,
            layouts,
            queryModes,
          }
        }

        const rest = pattern === '/' ? path : '/' + pathParts.slice(patternParts.length).join('/')
        const childResult = resolveRoutes(entry.children, rest, ctx, groupMatches, layouts, queryModes)
        if (childResult) {
          return { ...childResult, params: { ...params, ...childResult.params } }
        }
      }
      continue
    }

    // Exact match — entry is a component constructor
    const match = matchRoute(pattern, path)
    if (match) {
      return {
        route: pattern,
        params: match.params,
        component: entry,
        matches: [...parentMatches, pattern],
        guardRedirect: null,
        layouts: parentLayouts,
        queryModes: parentQueryModes,
      }
    }
  }

  // Wildcard fallback
  if ('*' in routes) {
    const wildcard = routes['*']
    const component = isComponentConstructor(wildcard) ? wildcard : null
    return {
      route: '*',
      params: {},
      component,
      matches: [...parentMatches, '*'],
      guardRedirect: null,
      layouts: parentLayouts,
      queryModes: parentQueryModes,
    }
  }

  return null
}

export function createServerRouter(url: string, routes: RouteMap, skipGuards = false): ServerRouteResult {
  const parsed = new URL(url)
  const path = parsed.pathname
  const query = parseQuery(parsed.search)
  const hash = parsed.hash

  const resolved = resolveRoutes(routes, path, { query, skipGuards })

  return {
    path,
    route: resolved?.route ?? '',
    params: resolved?.params ?? {},
    query,
    hash,
    matches: resolved?.matches ?? [],
    component: resolved?.component ?? null,
    layouts: resolved?.layouts ?? [],
    queryModes: resolved?.queryModes ?? new Map(),
    guardRedirect: resolved?.guardRedirect ?? null,
    isNotFound: !resolved || resolved.route === '*',
  }
}
