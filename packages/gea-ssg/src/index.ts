export { renderToString } from './render'
export type { RenderOptions } from './render'

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
export type { ContentFile } from './content'

export { buildHeadTags, replaceTitle, minifyHtml } from './head'
export type { HeadConfig } from './head'

export { geaSSG } from './vite-plugin'

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
