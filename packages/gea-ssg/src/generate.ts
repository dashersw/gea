import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join, dirname, resolve, relative } from 'node:path'

import { RouterView, Link, Head } from '@geajs/core'
import { renderToString } from './render'
import { crawlRoutes } from './crawl'
import { parseShell, injectIntoShell } from './shell'
import { preloadContent, clearContentCache, serializeContentCache, serializeContentCacheForClient } from './content'
import { buildHeadTags, replaceTitle, minifyHtml } from './head'
import type { HeadConfig } from './head'
import type { SSGOptions, GenerateResult, GeneratedPage, StaticRoute, RobotsOptions } from './types'

export async function generate(options: SSGOptions): Promise<GenerateResult> {
  const {
    routes,
    shell: shellPath,
    outDir = 'dist',
    appElementId = 'app',
    onBeforeRender,
    onAfterRender,
    onRenderError,
    concurrency = 4,
    sitemap,
    robots,
    minify = false,
    trailingSlash = true,
  } = options

  const startTime = performance.now()
  const pages: GeneratedPage[] = []
  const errors: Array<{ path: string; error: Error }> = []
  const headConfigs = new Map<string, HeadConfig>()

  try {
    if (options.contentDir) {
      await preloadContent(options.contentDir)
      ;(globalThis as any).__SSG_CONTENT__ = JSON.parse(serializeContentCache())
    }

    const shellHtml = await readFile(shellPath, 'utf-8')
    const shellParts = parseShell(shellHtml, appElementId)

    const staticRoutes = await crawlRoutes(routes)

    if (!staticRoutes.length) {
      console.warn('[gea-ssg] No static routes found.')
      return { pages, duration: performance.now() - startTime, errors }
    }

    const absOut = resolve(outDir)
    const seenPaths = new Set<string>()
    for (const route of staticRoutes) {
      const target = resolve(getOutputPath(route.path, outDir, trailingSlash))
      const rel = relative(absOut, target)
      if (rel.startsWith('..') || resolve(rel) === rel) {
        throw new Error(`[gea-ssg] Path traversal detected: "${route.path}" escapes outDir.`)
      }
      if (seenPaths.has(route.path)) {
        console.warn(`[gea-ssg] Duplicate path "${route.path}" — later render will overwrite.`)
      }
      seenPaths.add(route.path)
    }

    console.log(`[gea-ssg] Found ${staticRoutes.length} routes, rendering...`)

    const renderRoute = async (route: StaticRoute, index: number): Promise<void> => {
      try {
        if (onBeforeRender) {
          await onBeforeRender({
            path: route.path,
            params: route.params,
            component: route.component,
            layouts: route.layouts,
          })
        }

        Head._current = null
        let html: string
        let hasHydrationMarkers = false
        try {
          RouterView._ssgRoute = {
            component: route.component,
            layouts: route.layouts,
            params: route.params,
          }
          Link._ssgCurrentPath = route.path
          const result = renderToString(options.app, undefined, { seed: index, hydrate: options.hydrate })
          html = result.html
          hasHydrationMarkers = result.hasHydrationMarkers
        } finally {
          RouterView._ssgRoute = null
          Link._ssgCurrentPath = null
        }

        let fullHtml = injectIntoShell(shellParts, html)

        // In MPA/hydrate mode content is baked into SSG HTML at build time —
        // no global content.js is generated, so ssg.content() / ssg.file()
        // will return empty results on the client.  Content access should
        // happen through the pre-rendered HTML instead.
        if (options.contentDir && !options.hydrate) {
          const base = (options.base || '/').replace(/\/?$/, '/')
          fullHtml = fullHtml.replace(/(<head[^>]*>)/i, `$1\n<script defer src="${base}_ssg/content.js"></script>`)
        }

        if (Head._current) {
          const headConfig = { ...Head._current } as HeadConfig
          headConfigs.set(route.path, headConfig)

          if (headConfig.title) {
            fullHtml = replaceTitle(fullHtml, headConfig.title)
          }

          const headTags = buildHeadTags(headConfig)
          if (headTags) {
            fullHtml = fullHtml.replace('</head>', headTags + '\n</head>')
          }
        }

        if (onAfterRender) {
          const transformed = await onAfterRender(
            {
              path: route.path,
              params: route.params,
              component: route.component,
              layouts: route.layouts,
            },
            fullHtml,
          )
          if (transformed !== undefined) fullHtml = transformed
        }

        // Strip client JS from pages that have no interactive components.
        // Uses the explicit flag from renderToString instead of scanning the
        // HTML text — avoids false positives when article content mentions
        // "data-gea" in code samples or prose.
        if (options.hydrate && !hasHydrationMarkers) {
          fullHtml = fullHtml.replace(/<script type="module"[^>]*><\/script>/g, '')
          fullHtml = fullHtml.replace(/<link[^>]*rel="modulepreload"[^>]*\/?>/g, '')
        }

        if (minify) {
          fullHtml = minifyHtml(fullHtml)
        }

        const outputPath = getOutputPath(route.path, outDir, trailingSlash)
        await mkdir(dirname(outputPath), { recursive: true })
        await writeFile(outputPath, fullHtml, 'utf-8')

        pages.push({
          path: route.path,
          outputPath,
          size: Buffer.byteLength(fullHtml, 'utf-8'),
        })
      } catch (error) {
        const err = error as Error
        errors.push({ path: route.path, error: err })
        if (onRenderError) {
          onRenderError(route.path, err)
        } else {
          console.error(`[gea-ssg] Render error: ${route.path}`, err.message)
        }
      }
    }

    await runWithConcurrency(staticRoutes, renderRoute, concurrency)

    // In MPA/hydrate mode content.js is intentionally skipped — see note above.
    if (options.contentDir && !options.hydrate) {
      const ssgDir = join(outDir, '_ssg')
      await mkdir(ssgDir, { recursive: true })
      const clientJson = serializeContentCacheForClient().replace(/<\//g, '<\\/')
      await writeFile(join(ssgDir, 'content.js'), `window.__SSG_CONTENT__=${clientJson}`, 'utf-8')
    }

    if (sitemap) {
      const sitemapOpts = typeof sitemap === 'boolean' ? { hostname: 'https://example.com' } : sitemap
      if (typeof sitemap === 'boolean') {
        console.warn(
          '[gea-ssg] sitemap: true uses placeholder hostname "https://example.com". Pass { hostname: "https://your-site.com" } for production.',
        )
      }
      await generateSitemap(pages, sitemapOpts, outDir, headConfigs, trailingSlash)
    }

    if (robots) {
      await generateRobots(robots, sitemap, outDir)
    }

    const duration = performance.now() - startTime
    console.log(`[gea-ssg] ✓ ${pages.length} pages generated (${errors.length} errors), ${Math.round(duration)}ms`)

    return { pages, duration, errors }
  } finally {
    clearContentCache()
    delete (globalThis as any).__SSG_CONTENT__
    Head._current = null
  }
}

function getOutputPath(routePath: string, outDir: string, trailingSlash: boolean = true): string {
  if (routePath === '/' || routePath === '') {
    return join(outDir, 'index.html')
  }
  if (routePath === '/404') {
    return join(outDir, '404', 'index.html')
  }
  if (trailingSlash) {
    return join(outDir, routePath, 'index.html')
  }
  return join(outDir, routePath + '.html')
}

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  limit: number,
): Promise<void> {
  const executing = new Set<Promise<void>>()

  for (let i = 0; i < items.length; i++) {
    const p = fn(items[i], i).then(() => {
      executing.delete(p)
    })
    executing.add(p)

    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

async function generateSitemap(
  pages: GeneratedPage[],
  options: { hostname: string; changefreq?: string; priority?: number; exclude?: string[] },
  outDir: string,
  headConfigs: Map<string, HeadConfig>,
  trailingSlash: boolean,
): Promise<void> {
  const { hostname, changefreq = 'weekly', priority = 0.8, exclude = [] } = options

  const urls = [...pages]
    .sort((a, b) => a.path.localeCompare(b.path))
    .filter((p) => !exclude.includes(p.path) && p.path !== '/404')
    .map((p) => {
      const head = headConfigs.get(p.path)
      const lastmod = head?.lastmod ? `\n    <lastmod>${head.lastmod}</lastmod>` : ''
      const loc = trailingSlash && p.path !== '/' ? `${hostname}${p.path}/` : `${hostname}${p.path}`
      return `  <url>
    <loc>${escapeXml(loc)}</loc>${lastmod}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
    })
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`

  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'sitemap.xml'), xml, 'utf-8')
}

async function generateRobots(
  options: boolean | RobotsOptions,
  sitemap: SSGOptions['sitemap'],
  outDir: string,
): Promise<void> {
  const lines: string[] = ['User-agent: *']
  const hostname = typeof sitemap === 'object' && sitemap ? sitemap.hostname : undefined

  if (typeof options === 'object') {
    if (options.allow) {
      for (const path of options.allow) lines.push(`Allow: ${path}`)
    }
    if (options.disallow) {
      for (const path of options.disallow) lines.push(`Disallow: ${path}`)
    } else {
      lines.push('Allow: /')
    }
    if (options.sitemap !== false && hostname) {
      lines.push('', `Sitemap: ${hostname}/sitemap.xml`)
    }
  } else {
    lines.push('Allow: /')
    if (hostname) {
      lines.push('', `Sitemap: ${hostname}/sitemap.xml`)
    }
  }

  await writeFile(join(outDir, 'robots.txt'), lines.join('\n') + '\n', 'utf-8')
}
