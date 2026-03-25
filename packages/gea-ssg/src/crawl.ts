import type { RouteMap, RouteEntry, RouteGroupConfig } from '@geajs/core'
import type { StaticRoute } from './types'
import { getContentSlugs } from './content'

export async function crawlRoutes(routes: RouteMap, basePath: string = ''): Promise<StaticRoute[]> {
  const result: StaticRoute[] = []

  for (const [pattern, entry] of Object.entries(routes)) {
    await collectPaths(pattern, entry, basePath, [], result)
  }

  return result
}

async function collectPaths(
  pattern: string,
  entry: RouteEntry,
  basePath: string,
  parentLayouts: any[],
  result: StaticRoute[],
): Promise<void> {
  const fullPath = normalizePath(basePath + pattern)

  if (typeof entry === 'string') return

  if (isRedirectConfig(entry)) return

  if (isRouteGroupConfig(entry)) {
    const layouts = entry.layout ? [...parentLayouts, entry.layout] : parentLayouts

    for (const [childPattern, childEntry] of Object.entries(entry.children)) {
      await collectPaths(childPattern, childEntry, fullPath, layouts, result)
    }
    return
  }

  if (isSSGRouteConfig(entry)) {
    const component = (entry as any).component

    if ((entry as any).content) {
      const subdir = (entry as any).content as string
      const slugs = getContentSlugs(subdir)
      const paramName = extractParamName(pattern)

      if (!paramName) {
        console.warn(`[gea-ssg] Route "${fullPath}" has content but no param in pattern, skipping.`)
        return
      }

      if (!slugs.length) {
        console.warn(`[gea-ssg] No content found for "${subdir}" — route "${fullPath}" will have no pages.`)
        return
      }

      for (const slug of slugs) {
        const params = { [paramName]: slug }
        result.push({
          path: resolveParams(fullPath, params),
          component,
          layouts: parentLayouts,
          params,
        })
      }
      return
    }

    if ((entry as any).paths) {
      const paths = (entry as any).paths as Array<{ params: Record<string, string> }>
      for (const pathEntry of paths) {
        result.push({
          path: resolveParams(fullPath, pathEntry.params),
          component,
          layouts: parentLayouts,
          params: pathEntry.params,
        })
      }
      return
    }

    if (pattern === '*') {
      result.push({ path: '/404', component, layouts: parentLayouts, params: {} })
      return
    }

    result.push({ path: fullPath, component, layouts: parentLayouts, params: {} })
    return
  }

  let component = entry
  if (isLazyComponent(entry)) {
    const mod = await (entry as () => Promise<any>)()
    component = 'default' in mod ? mod.default : mod
  }

  if (pattern === '*') {
    result.push({ path: '/404', component: component as any, layouts: parentLayouts, params: {} })
    return
  }

  if (pattern.includes(':')) return

  result.push({
    path: fullPath,
    component,
    layouts: parentLayouts,
    params: {},
  })
}

function extractParamName(pattern: string): string | null {
  const match = pattern.match(/:(\w+)/)
  return match ? match[1] : null
}

function resolveParams(path: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((p, [key, value]) => p.replace(`:${key}`, value), path)
}

function normalizePath(path: string): string {
  const cleaned = '/' + path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '')
  return cleaned === '/' ? '/' : cleaned.replace(/\/$/, '')
}

function isRouteGroupConfig(entry: RouteEntry): entry is RouteGroupConfig {
  return typeof entry === 'object' && entry !== null && 'children' in entry
}

function isRedirectConfig(entry: RouteEntry): boolean {
  return typeof entry === 'object' && entry !== null && 'redirect' in entry
}

function isLazyComponent(entry: RouteEntry): boolean {
  return typeof entry === 'function' && !(entry as any).prototype
}

function isSSGRouteConfig(entry: RouteEntry): boolean {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'component' in entry &&
    !('children' in entry) &&
    !('redirect' in entry)
  )
}
