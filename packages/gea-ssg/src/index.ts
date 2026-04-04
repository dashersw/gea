export { renderToString } from './render'
export type { RenderOptions, RenderResult } from './render'

export { crawlRoutes } from './crawl'

export { generate } from './generate'

export { parseShell, injectIntoShell } from './shell'
export type { ShellParts } from './shell'

export {
  ssg,
  preloadContent,
  clearContentCache,
  serializeContentCache,
  serializeContentCacheForClient,
  getContentSlugs,
} from './content'
export type { ContentFile } from './types'

export { buildHeadTags, replaceTitle, minifyHtml } from './head'
export type { HeadConfig } from './head'

export { geaSSG } from './vite-plugin'

/**
 * Server-side no-op for `hydrate`.
 * The real implementation lives in `./client.ts` which Vite aliases
 * `@geajs/ssg` to during browser builds.  This stub ensures
 * `import { hydrate } from '@geajs/ssg'` type-checks without the alias.
 */
export function hydrate(_components: Record<string, new (props?: any) => any>): boolean {
  return false
}

export type {
  SSGOptions,
  SSGPluginOptions,
  StaticRoute,
  RenderContext,
  SitemapOptions,
  RobotsOptions,
  GenerateResult,
  GeneratedPage,
} from './types'
