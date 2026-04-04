export interface ContentFile<T = Record<string, any>> {
  slug: string
  frontmatter: T
  /** Raw markdown — available during build, omitted in client payload */
  content?: string
  html: string
}

export interface SSGOptions {
  routes: Record<string, any>
  app: new (props?: any) => any
  shell: string
  outDir?: string
  appElementId?: string
  contentDir?: string
  /** Base path for assets (default: '/') */
  base?: string
  /** Component class names to hydrate on the client (enables MPA mode) */
  hydrate?: string[]
  sitemap?: SitemapOptions | boolean
  robots?: boolean | RobotsOptions
  minify?: boolean
  trailingSlash?: boolean
  onBeforeRender?: (context: RenderContext) => void | Promise<void>
  onAfterRender?: (context: RenderContext, html: string) => string | Promise<string>
  onRenderError?: (path: string, error: Error) => void
  concurrency?: number
}

export interface RenderContext {
  path: string
  params: Record<string, string>
  component: any
  layouts: any[]
}

export interface StaticRoute {
  path: string
  component: any
  layouts: any[]
  params: Record<string, string>
}

export interface SitemapOptions {
  hostname: string
  changefreq?: string
  priority?: number
  exclude?: string[]
}

export interface RobotsOptions {
  disallow?: string[]
  allow?: string[]
  sitemap?: boolean
}

export interface SSGPluginOptions extends Omit<SSGOptions, 'shell' | 'outDir' | 'app' | 'routes'> {
  entry?: string
  contentDir?: string
  routes?: Record<string, any>
  app?: new (props?: any) => any
}

export interface GenerateResult {
  pages: GeneratedPage[]
  duration: number
  errors: Array<{ path: string; error: Error }>
}

export interface GeneratedPage {
  path: string
  outputPath: string
  size: number
}
