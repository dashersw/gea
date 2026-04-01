import type { GeaComponentConstructor, RouteMap } from './types'
import { isComponentConstructor, isRouteGroup } from './types'

export interface ServerRouteResult {
  path: string
  route: string
  params: Record<string, string>
  query: Record<string, string | string[]>
  hash: string
  matches: string[]
  component: GeaComponentConstructor | null
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
}

function resolveRoutes(
  routes: RouteMap,
  path: string,
  parentMatches: string[] = [],
  skipGuards = false,
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
        if (entry.guard && !skipGuards) {
          const guardResult = entry.guard()
          if (guardResult !== true) {
            return {
              route: pattern,
              params,
              component: null,
              matches: [...parentMatches, pattern],
              guardRedirect: typeof guardResult === 'string' ? guardResult : null,
            }
          }
        }
        const rest = pattern === '/' ? path : '/' + pathParts.slice(patternParts.length).join('/')
        const childResult = resolveRoutes(entry.children, rest, [...parentMatches, pattern], skipGuards)
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
      }
    }
  }

  // Wildcard fallback
  if ('*' in routes) {
    const wildcard = routes['*']
    const component = isComponentConstructor(wildcard) ? wildcard : null
    return { route: '*', params: {}, component, matches: [...parentMatches, '*'], guardRedirect: null }
  }

  return null
}

export function createServerRouter(url: string, routes: RouteMap, skipGuards = false): ServerRouteResult {
  const parsed = new URL(url)
  const path = parsed.pathname
  const query = parseQuery(parsed.search)
  const hash = parsed.hash

  const resolved = resolveRoutes(routes, path, [], skipGuards)

  return {
    path,
    route: resolved?.route ?? '',
    params: resolved?.params ?? {},
    query,
    hash,
    matches: resolved?.matches ?? [],
    component: resolved?.component ?? null,
    guardRedirect: resolved?.guardRedirect ?? null,
    isNotFound: !resolved || resolved.route === '*',
  }
}
