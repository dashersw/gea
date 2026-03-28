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

/**
 * Raw filesystem prefix for a layout file — like layoutFileToPrefix but keeps
 * `[param]` segments as-is (no conversion to `:param`).  Used for tree-ancestry
 * checks so dynamic layout dirs don't claim unrelated sibling pages.
 */
function layoutFileToFsPrefix(filePath: string, basePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  let path = filePath.slice(base.length)
  path = path.replace(/\/layout\.(tsx|ts|jsx|js)$/, '')
  if (!path || path === '/') return '/'
  return path
}

/**
 * Raw filesystem path for a page file — strips `/page.ext` but keeps
 * `[param]` segments as-is.  Used for layout-ownership checks.
 */
function pageFileToFsPath(filePath: string, basePath: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  let path = filePath.slice(base.length)
  path = path.replace(/\/page\.(tsx|ts|jsx|js)$/, '')
  if (!path || path === '/') return '/'
  return path
}

// ── Filesystem-path ancestry (literal segment matching) ──────────

/** True if `ancestorFsPrefix` is a strict filesystem ancestor of `childFsPrefix`. */
function isFsAncestor(ancestorFsPrefix: string, childFsPrefix: string): boolean {
  if (ancestorFsPrefix === childFsPrefix) return false
  if (ancestorFsPrefix === '/') return true
  return childFsPrefix.startsWith(ancestorFsPrefix + '/')
}

/** True if `pageFsPath` is at or under `layoutFsPrefix` in the filesystem tree. */
function isFsUnderPrefix(pageFsPath: string, layoutFsPrefix: string): boolean {
  if (layoutFsPrefix === '/') return true
  return pageFsPath === layoutFsPrefix || pageFsPath.startsWith(layoutFsPrefix + '/')
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
  fsPrefix: string      // raw filesystem prefix, e.g. '/users/[id]'
  patternPrefix: string // route-pattern prefix, e.g. '/users/:id'
  layout: any
  children: LayoutNode[]
}

function buildLayoutTree(
  sortedLayouts: Array<{ fsPrefix: string; patternPrefix: string; layout: any }>,
): LayoutNode[] {
  const nodes: LayoutNode[] = sortedLayouts.map(({ fsPrefix, patternPrefix, layout }) => ({
    fsPrefix,
    patternPrefix,
    layout,
    children: [],
  }))

  const roots: LayoutNode[] = []

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    let parent: LayoutNode | null = null

    for (let j = 0; j < i; j++) {
      const candidate = nodes[j]
      if (isFsAncestor(candidate.fsPrefix, node.fsPrefix)) {
        // Pick the deepest filesystem ancestor
        if (!parent || candidate.fsPrefix.length > parent.fsPrefix.length) {
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

/** True if `page` belongs directly to `node` (not to a child layout). */
function belongsToNode(
  page: { route: string; fsPath: string },
  node: LayoutNode,
): boolean {
  if (!isFsUnderPrefix(page.fsPath, node.fsPrefix)) return false
  // Must not fall under any child layout
  for (const child of node.children) {
    if (isFsUnderPrefix(page.fsPath, child.fsPrefix)) return false
  }
  return true
}

function buildGroupChildren(
  node: LayoutNode,
  pages: Array<{ route: string; fsPath: string; loader: LazyComponent }>,
): RouteMap {
  const children: Record<string, any> = {}

  // Pages owned directly by this node
  for (const page of pages) {
    if (!belongsToNode(page, node)) continue
    children[relativePath(page.route, node.patternPrefix)] = page.loader
  }

  // Nested layout groups
  for (const child of node.children) {
    const key = relativePath(child.patternPrefix, node.patternPrefix)
    const group: RouteGroupConfig = {
      layout: child.layout,
      children: buildGroupChildren(child, pages),
    }
    children[key] = group
  }

  return children as RouteMap
}

function buildNestedRouteMap(
  pages: Array<{ route: string; fsPath: string; loader: LazyComponent }>,
  sortedLayouts: Array<{ fsPrefix: string; patternPrefix: string; layout: any }>,
): RouteMap {
  const roots = buildLayoutTree(sortedLayouts)
  const result: Record<string, any> = {}

  // Pages not under any root layout node
  for (const page of pages) {
    const underRoot = roots.some((r) => isFsUnderPrefix(page.fsPath, r.fsPrefix))
    if (!underRoot) result[page.route] = page.loader
  }

  // Layout groups
  for (const root of roots) {
    const group: RouteGroupConfig = {
      layout: root.layout,
      children: buildGroupChildren(root, pages),
    }
    result[root.patternPrefix] = group
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
  const pages: Array<{ route: string; fsPath: string; loader: LazyComponent }> = []
  for (const [filePath, loader] of Object.entries(pageGlob)) {
    pages.push({
      route: pageFileToRoute(filePath, basePath),
      fsPath: pageFileToFsPath(filePath, basePath),
      loader,
    })
  }

  const layoutsList: Array<{ fsPrefix: string; patternPrefix: string; layout: any }> = []
  for (const [filePath, mod] of Object.entries(layoutGlob)) {
    layoutsList.push({
      fsPrefix: layoutFileToFsPrefix(filePath, basePath),
      patternPrefix: layoutFileToPrefix(filePath, basePath),
      layout: mod.default ?? mod,
    })
  }

  if (layoutsList.length === 0) {
    // No layouts — flat map
    const flat: Record<string, any> = {}
    for (const { route, loader } of pages) flat[route] = loader
    return flat as RouteMap
  }

  const sortedLayouts = layoutsList.sort((a, b) => {
    const da = a.fsPrefix === '/' ? 0 : a.fsPrefix.split('/').filter(Boolean).length
    const db = b.fsPrefix === '/' ? 0 : b.fsPrefix.split('/').filter(Boolean).length
    return da - db
  })

  return buildNestedRouteMap(pages, sortedLayouts)
}
