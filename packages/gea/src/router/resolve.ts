import type {
  RouteMap,
  RouteEntry,
  RouteGroupConfig,
  RouteComponent,
  ResolvedRoute,
  LazyComponent,
  RedirectConfig,
} from './types'
import { matchRoute } from './match'
import { resolveRedirect } from './redirect'

function isRouteGroupConfig(entry: RouteEntry): entry is RouteGroupConfig {
  return typeof entry === 'object' && entry !== null && 'children' in entry
}

function isRedirectConfig(entry: RouteEntry): entry is RedirectConfig {
  return typeof entry === 'object' && entry !== null && 'redirect' in entry
}

function isLazyComponent(entry: RouteEntry): entry is LazyComponent {
  return typeof entry === 'function' && !entry.prototype
}

function matchPrefix(pattern: string, path: string): { params: Record<string, string>; rest: string } | null {
  if (pattern === '/') return { params: {}, rest: path }

  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  if (pathParts.length < patternParts.length) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    const pathPart = pathParts[i]
    if (pp.startsWith(':')) params[pp.slice(1)] = decodeURIComponent(pathPart)
    else if (pp !== pathPart) return null
  }

  return { params, rest: '/' + pathParts.slice(patternParts.length).join('/') }
}

function createEmptyResult(): ResolvedRoute {
  return {
    component: null,
    guardComponent: null,
    layouts: [],
    guards: [],
    pattern: '',
    params: {},
    matches: [],
    queryModes: new Map(),
  }
}

export function resolveRoute(routes: RouteMap, path: string, search?: string): ResolvedRoute {
  const result = createEmptyResult()
  resolveRecursive(routes, path, search || '', result)
  return result
}

function resolveRecursive(routes: RouteMap, path: string, search: string, result: ResolvedRoute): boolean {
  let wildcard: RouteEntry | undefined
  for (const key of Object.keys(routes)) {
    if (key === '*') {
      wildcard = routes[key]
      continue
    }
    if (tryResolveEntry(key, routes[key], path, search, result)) return true
  }
  return wildcard !== undefined && tryResolveEntry('*', wildcard, path, search, result)
}

function tryResolveEntry(
  pattern: string,
  entry: RouteEntry,
  path: string,
  search: string,
  result: ResolvedRoute,
): boolean {
  if (typeof entry === 'string' || isRedirectConfig(entry)) {
    const match = matchRoute(pattern, path)
    if (!match) return false

    addMatch(result, pattern, match.params)
    const redirectResult = resolveRedirect(entry as any, match.params, path)
    result.redirect = redirectResult.target
    result.redirectMethod = redirectResult.method
    if (typeof entry === 'object') result.redirectStatus = entry.status
    return true
  }

  if (isRouteGroupConfig(entry)) {
    const prefixMatch = matchPrefix(pattern, path)
    if (!prefixMatch) return false

    const paramsBefore = Object.keys(result.params)
    const matchesBefore = result.matches.length
    const layoutsBefore = result.layouts.length

    addMatch(result, pattern, prefixMatch.params)
    if (entry.layout) result.layouts.push(entry.layout)
    if (entry.guard) result.guards.push(entry.guard)

    if (entry.mode?.type === 'query') {
      const childKeys = Object.keys(entry.children)
      const searchParams = new URLSearchParams(search)
      let activeKey = searchParams.get(entry.mode.param) || childKeys[0]
      if (!childKeys.includes(activeKey)) activeKey = childKeys[0]

      if (entry.layout) {
        result.queryModes.set(result.layouts.length - 1, {
          activeKey,
          keys: childKeys,
          param: entry.mode.param,
        })
      }

      const childEntry = entry.children[activeKey]
      if (childEntry !== undefined) {
        tryResolveEntry(prefixMatch.rest, childEntry, prefixMatch.rest, search, result)
      }
      return true
    }

    if (resolveRecursive(entry.children, prefixMatch.rest, search, result)) return true

    // Preserve accumulated layouts/guards for sibling fallbacks, matching the
    // previous resolver behavior, but roll back path-specific data.
    restoreParams(result, paramsBefore)
    result.matches.length = matchesBefore
    for (const key of result.queryModes.keys()) {
      if (key >= layoutsBefore) result.queryModes.delete(key)
    }
    return false
  }

  const match = matchRoute(pattern, path)
  if (!match) return false

  addMatch(result, pattern, match.params)
  if (isLazyComponent(entry)) {
    result.component = null
    result.isLazy = true
    result.lazyLoader = entry
  } else {
    result.component = entry as RouteComponent
  }
  return true
}

function addMatch(result: ResolvedRoute, pattern: string, params: Record<string, string>): void {
  result.pattern = pattern
  result.matches.push(pattern)
  for (const key of Object.keys(params)) result.params[key] = params[key]
}

function restoreParams(result: ResolvedRoute, keep: string[]): void {
  for (const key of Object.keys(result.params)) {
    if (!keep.includes(key)) delete result.params[key]
  }
}
