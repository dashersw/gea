import type { RouteMap, RouteGroupConfig, LazyComponent } from './types'

// ── Path conversion ──────────────────────────────────────────────

/**
 * Convert a glob file path for a page file into a route key.
 *
 * Conventions:
 *   ./pages/page.tsx                  → '/'
 *   ./pages/about/page.tsx            → '/about'
 *   ./pages/users/[id]/page.tsx       → '/users/:id'
 *   ./pages/[...all]/page.tsx         → '*'
 *   ./pages/blog/[...slug]/page.tsx   → '/blog/*'
 */
function pageFileToRoute(filePath: string, basePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  let path = filePath.slice(base.length)

  // Remove /page.{ext} suffix
  path = path.replace(/\/page\.(tsx|ts|jsx|js)$/, '')

  // Catch-all [...name] as the last directory segment
  const catchAll = path.match(/^(.*?)\/\[\.\.\.([^\]]+)\]$/)
  if (catchAll) {
    const prefix = catchAll[1]
    if (!prefix) return '*'
    return prefix.replace(/\[([^\]]+)\]/g, ':$1') + '/*'
  }

  if (!path || path === '/') return '/'

  // [param] → :param
  return path.replace(/\[([^\]]+)\]/g, ':$1')
}

/**
 * Convert a glob file path for a layout file into the route prefix it covers.
 *
 *   ./pages/layout.tsx            → '/'
 *   ./pages/users/layout.tsx      → '/users'
 *   ./pages/users/[id]/layout.tsx → '/users/:id'
 */
function layoutFileToPrefix(filePath: string, basePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  let path = filePath.slice(base.length)

  // Remove /layout.{ext} suffix
  path = path.replace(/\/layout\.(tsx|ts|jsx|js)$/, '')

  if (!path || path === '/') return '/'

  return path.replace(/\[([^\]]+)\]/g, ':$1')
}

// ── Prefix matching (segment-aware, handles dynamic params) ──────

/**
 * Returns true if `route` is under `prefix` (exact match or a sub-path).
 * Handles dynamic segments like `:id`.
 */
function isUnderPrefix(route: string, prefix: string): boolean {
  if (prefix === '/') return true
  if (route === '*') return false // bare wildcard belongs only to root

  const prefixParts = prefix.split('/').filter(Boolean)
  const routeParts = route === '*' ? [] : route.split('/').filter(Boolean)

  if (routeParts.length < prefixParts.length) return false

  for (let i = 0; i < prefixParts.length; i++) {
    const pp = prefixParts[i]
    if (pp.startsWith(':')) continue // dynamic — always matches
    if (pp !== routeParts[i]) return false
  }

  return true
}

/** True if `ancestorPrefix` is a strict ancestor of `childPrefix`. */
function isAncestor(ancestorPrefix: string, childPrefix: string): boolean {
  if (ancestorPrefix === childPrefix) return false
  return isUnderPrefix(childPrefix, ancestorPrefix)
}

// ── Relative path ────────────────────────────────────────────────

/**
 * Compute the path of `fullRoute` relative to `prefix`.
 *
 *   relativePath('/users/:id', '/users') → '/:id'
 *   relativePath('/users', '/users')     → '/'
 *   relativePath('/about', '/')          → '/about'  (root: no stripping)
 */
function relativePath(fullRoute: string, prefix: string): string {
  if (prefix === '/') return fullRoute // root layout: children use full paths

  if (fullRoute === prefix) return '/'

  const prefixDepth = prefix.split('/').filter(Boolean).length
  const routeParts = fullRoute.split('/').filter(Boolean)
  return '/' + routeParts.slice(prefixDepth).join('/') || '/'
}

// ── Layout tree ──────────────────────────────────────────────────

interface LayoutNode {
  prefix: string
  layout: any
  children: LayoutNode[]
}

function buildLayoutTree(prefixes: string[], layouts: Map<string, any>): LayoutNode[] {
  const nodes: LayoutNode[] = prefixes.map((prefix) => ({
    prefix,
    layout: layouts.get(prefix)!,
    children: [],
  }))

  const roots: LayoutNode[] = []

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    let parent: LayoutNode | null = null

    for (let j = 0; j < i; j++) {
      const candidate = nodes[j]
      if (isAncestor(candidate.prefix, node.prefix)) {
        // Pick the deepest ancestor
        if (!parent || candidate.prefix.length > parent.prefix.length) {
          parent = candidate
        }
      }
    }

    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

// ── RouteMap builder ─────────────────────────────────────────────

/** True if `route` belongs directly to `node` (not to a child layout). */
function belongsToNode(route: string, node: LayoutNode): boolean {
  if (!isUnderPrefix(route, node.prefix)) return false
  // Must not fall under any child layout
  for (const child of node.children) {
    if (isUnderPrefix(route, child.prefix)) return false
  }
  return true
}

function buildGroupChildren(
  node: LayoutNode,
  pages: Array<{ route: string; loader: LazyComponent }>,
): RouteMap {
  const children: Record<string, any> = {}

  // Pages owned directly by this node
  for (const { route, loader } of pages) {
    if (!belongsToNode(route, node)) continue
    children[relativePath(route, node.prefix)] = loader
  }

  // Nested layout groups
  for (const child of node.children) {
    const key = relativePath(child.prefix, node.prefix)
    const group: RouteGroupConfig = {
      layout: child.layout,
      children: buildGroupChildren(child, pages),
    }
    children[key] = group
  }

  return children as RouteMap
}

function buildNestedRouteMap(
  pages: Array<{ route: string; loader: LazyComponent }>,
  layouts: Map<string, any>,
): RouteMap {
  const sortedPrefixes = [...layouts.keys()].sort((a, b) => {
    const da = a === '/' ? 0 : a.split('/').filter(Boolean).length
    const db = b === '/' ? 0 : b.split('/').filter(Boolean).length
    return da - db
  })

  const roots = buildLayoutTree(sortedPrefixes, layouts)
  const result: Record<string, any> = {}

  // Pages not under any root layout node
  for (const { route, loader } of pages) {
    const underRoot = roots.some((r) => isUnderPrefix(route, r.prefix))
    if (!underRoot) result[route] = loader
  }

  // Layout groups
  for (const root of roots) {
    const group: RouteGroupConfig = {
      layout: root.layout,
      children: buildGroupChildren(root, pages),
    }
    result[root.prefix] = group
  }

  return result as RouteMap
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Builds a `RouteMap` from Vite `import.meta.glob` results.
 *
 * This function is called automatically by the Gea Vite plugin when you use
 * `router.setPath('./pages')`. Do not call it directly.
 *
 * File conventions (Next.js App Router style):
 * - `page.tsx`   — the page component for a route
 * - `layout.tsx` — wraps all routes in the same directory (and sub-directories)
 * - `[param]/`   — dynamic route segment → `:param`
 * - `[...slug]/` — catch-all segment → `*`
 *
 * @param pageGlob   `import.meta.glob('.../page.{tsx,ts,jsx,js}')`
 * @param layoutGlob `import.meta.glob('.../layout.{tsx,ts,jsx,js}', { eager: true })`
 * @param basePath   The base directory (e.g. `'./pages'`)
 */
export function buildFileRoutes(
  pageGlob: Record<string, () => Promise<any>>,
  layoutGlob: Record<string, any>,
  basePath: string,
): RouteMap {
  const pages: Array<{ route: string; loader: LazyComponent }> = []
  for (const [filePath, loader] of Object.entries(pageGlob)) {
    pages.push({ route: pageFileToRoute(filePath, basePath), loader })
  }

  const layouts: Map<string, any> = new Map()
  for (const [filePath, mod] of Object.entries(layoutGlob)) {
    layouts.set(layoutFileToPrefix(filePath, basePath), mod.default ?? mod)
  }

  if (layouts.size === 0) {
    // No layouts — flat map
    const flat: Record<string, any> = {}
    for (const { route, loader } of pages) flat[route] = loader
    return flat as RouteMap
  }

  return buildNestedRouteMap(pages, layouts)
}
