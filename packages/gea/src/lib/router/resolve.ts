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

/** Match a pattern as a prefix of the path. Returns the matched params and the remaining path. */
function matchPrefix(pattern: string, path: string): { params: Record<string, string>; rest: string } | null {
  // Root/pathless pattern — matches everything, consumes nothing
  if (pattern === '/') {
    return { params: {}, rest: path }
  }

  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  if (pathParts.length < patternParts.length) return null

  const params: Record<string, string> = {}

  for (let i = 0; i < patternParts.length; i++) {
    const pp = patternParts[i]
    const pathPart = pathParts[i]

    if (pp.startsWith(':')) {
      params[pp.slice(1)] = decodeURIComponent(pathPart)
    } else if (pp !== pathPart) {
      return null
    }
  }

  const rest = '/' + pathParts.slice(patternParts.length).join('/')
  return { params, rest }
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
  const resolved = resolveRecursive(routes, path, search || '', result)
  return resolved
}

function resolveRecursive(routes: RouteMap, path: string, search: string, result: ResolvedRoute): ResolvedRoute {
  const keys = Object.keys(routes)
  // Separate wildcard from regular keys — try wildcard last
  const regularKeys = keys.filter((k) => k !== '*')
  const hasWildcard = keys.includes('*')

  for (const key of regularKeys) {
    const entry = routes[key]
    const resolved = tryResolveEntry(key, entry, path, search, result)
    if (resolved) return resolved
  }

  // Try wildcard catch-all last
  if (hasWildcard) {
    const entry = routes['*']
    const resolved = tryResolveEntry('*', entry, path, search, result)
    if (resolved) return resolved
  }

  return result // component remains null — no match
}

function tryResolveEntry(
  pattern: string,
  entry: RouteEntry,
  path: string,
  search: string,
  result: ResolvedRoute,
): ResolvedRoute | null {
  // --- String redirect ---
  if (typeof entry === 'string') {
    const match = matchRoute(pattern, path)
    if (!match) return null

    const redirectResult = resolveRedirect(entry, match.params, path)
    return {
      ...result,
      pattern,
      params: { ...result.params, ...match.params },
      matches: [...result.matches, pattern],
      redirect: redirectResult.target,
      redirectMethod: redirectResult.method,
    }
  }

  // --- RedirectConfig ---
  if (isRedirectConfig(entry)) {
    const match = matchRoute(pattern, path)
    if (!match) return null

    const redirectResult = resolveRedirect(entry, match.params, path)
    return {
      ...result,
      pattern,
      params: { ...result.params, ...match.params },
      matches: [...result.matches, pattern],
      redirect: redirectResult.target,
      redirectMethod: redirectResult.method,
      redirectStatus: redirectResult.status,
    }
  }

  // --- RouteGroupConfig (nested) ---
  if (isRouteGroupConfig(entry)) {
    const prefixMatch = matchPrefix(pattern, path)
    if (!prefixMatch) return null

    const nextResult: ResolvedRoute = {
      ...result,
      params: { ...result.params, ...prefixMatch.params },
      matches: [...result.matches, pattern],
      layouts: [...result.layouts],
      guards: [...result.guards],
      queryModes: new Map(result.queryModes),
    }

    if (entry.layout) {
      nextResult.layouts.push(entry.layout)
    }

    if (entry.guard) {
      nextResult.guards.push(entry.guard)
    }

    // --- Query mode ---
    if (entry.mode && entry.mode.type === 'query') {
      const childKeys = Object.keys(entry.children)
      const searchParams = new URLSearchParams(search)
      let activeKey = searchParams.get(entry.mode.param) || childKeys[0]

      // Ensure the key exists, default to first
      if (!childKeys.includes(activeKey)) {
        activeKey = childKeys[0]
      }

      if (entry.layout) {
        nextResult.queryModes.set(nextResult.layouts.length - 1, {
          activeKey,
          keys: childKeys,
          param: entry.mode.param,
        })
      }

      const childEntry = entry.children[activeKey]
      if (childEntry !== undefined) {
        // For query mode, resolve the child against the same remaining path
        const childRoutes: RouteMap = { [prefixMatch.rest]: childEntry }
        return resolveRecursive(childRoutes, prefixMatch.rest, search, nextResult)
      }

      return nextResult
    }

    // --- Path mode (default) ---
    const childResult = resolveRecursive(entry.children, prefixMatch.rest, search, nextResult)
    if (!childResult.component && !childResult.redirect && !childResult.isLazy) {
      // Children didn't match — propagate accumulated guards/layouts
      // so that sibling routes (e.g. wildcard) inherit them.
      result.guards = nextResult.guards
      result.layouts = nextResult.layouts
      return null
    }
    return childResult
  }

  // --- SSG route config: { component, ... } ---
  if (
    typeof entry === 'object' &&
    entry !== null &&
    'component' in entry &&
    !('children' in entry) &&
    !('redirect' in entry)
  ) {
    return tryResolveEntry(pattern, (entry as any).component, path, search, result)
  }

  // --- Leaf: function or component ---
  const match = matchRoute(pattern, path)
  if (!match) return null

  const mergedParams = { ...result.params, ...match.params }
  const mergedMatches = [...result.matches, pattern]

  if (isLazyComponent(entry)) {
    return {
      ...result,
      component: null,
      pattern,
      params: mergedParams,
      matches: mergedMatches,
      isLazy: true,
      lazyLoader: entry as LazyComponent,
    }
  }

  // Direct component class
  return {
    ...result,
    component: entry as RouteComponent,
    pattern,
    params: mergedParams,
    matches: mergedMatches,
  }
}
