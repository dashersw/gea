import { dirname, join, extname, resolve } from 'node:path'
import { existsSync, createReadStream } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin, ResolvedConfig } from 'vite'
import type { SSGPluginOptions } from './types'

const __dir = dirname(fileURLToPath(import.meta.url))
const SSG_SRC_DIR = __dir.endsWith('/dist') || __dir.endsWith('\\dist') ? join(__dir, '..', 'src') : __dir

export function geaSSG(options: SSGPluginOptions = {}): Plugin[] {
  let config: ResolvedConfig
  let contentLoaded = false
  let cachedContentJson = '{}'

  return [
    {
      name: 'gea-ssg',
      apply: 'build',

      config() {
        return {
          resolve: {
            alias: { '@geajs/ssg': SSG_SRC_DIR + '/client.ts' },
          },
        }
      },

      configResolved(resolvedConfig) {
        config = resolvedConfig
      },

      async closeBundle() {
        console.log('[gea-ssg] Starting static page generation...')

        try {
          const { createServer, loadConfigFromFile } = await import('vite')

          let userPlugins: any[] = []
          let userAlias: Record<string, string> = {}

          if (config.configFile) {
            const loaded = await loadConfigFromFile(
              { command: 'serve', mode: config.mode },
              config.configFile,
              config.root,
            )
            if (loaded?.config) {
              userPlugins = ((loaded.config.plugins || []) as any[])
                .flat(Infinity)
                .filter((p: any) => p && typeof p === 'object' && 'name' in p && !p.name.startsWith('gea-ssg'))
              const alias = loaded.config.resolve?.alias
              if (alias && typeof alias === 'object' && !Array.isArray(alias)) {
                userAlias = alias as Record<string, string>
              }
            }
          }

          const viteServer = await createServer({
            configFile: false,
            root: config.root,
            server: { middlewareMode: true, hmr: false, watch: null },
            appType: 'custom',
            plugins: userPlugins,
            optimizeDeps: { noDiscovery: true, include: [] },
            resolve: {
              alias: { ...userAlias, '@geajs/ssg': SSG_SRC_DIR + '/index.ts' },
            },
          })

          try {
            const { generate } = await viteServer.ssrLoadModule(`${SSG_SRC_DIR}/generate.ts`)

            const ssgOpts: Record<string, any> = {
              shell: `${config.build.outDir}/index.html`,
              outDir: config.build.outDir,
              base: config.base || '/',
              appElementId: options.appElementId || 'app',
              contentDir: options.contentDir ? resolve(config.root, options.contentDir) : undefined,
              sitemap: options.sitemap,
              robots: options.robots,
              minify: options.minify,
              trailingSlash: options.trailingSlash,
              onBeforeRender: options.onBeforeRender,
              onAfterRender: options.onAfterRender,
              onRenderError: options.onRenderError,
              concurrency: options.concurrency,
            }

            if (options.routes && options.app) {
              ssgOpts.routes = options.routes
              ssgOpts.app = options.app
            } else {
              const entry = options.entry || 'src/App.tsx'
              const ssgEntry = await viteServer.ssrLoadModule(entry)
              ssgOpts.routes = ssgEntry.routes
              ssgOpts.app = ssgEntry.App || ssgEntry.default

              if (!ssgOpts.routes || !ssgOpts.app) {
                throw new Error(`[gea-ssg] ${entry} must export "routes" and "App" (or default).`)
              }
            }

            await generate(ssgOpts)
          } finally {
            await viteServer.close()
          }
          // Vite's middlewareMode leaks internal handles after close.
          // This timer only fires if leaked handles keep the event loop alive.
          setTimeout(() => process.exit(0), 0).unref()
        } catch (error) {
          console.error('[gea-ssg] SSG error:', error)
          throw error
        }
      },
    },

    {
      name: 'gea-ssg:dev',
      apply: 'serve',

      config() {
        return {
          resolve: {
            alias: { '@geajs/ssg': SSG_SRC_DIR + '/client.ts' },
          },
        }
      },

      configResolved(resolvedConfig) {
        config = resolvedConfig
      },

      async transformIndexHtml(_html, ctx) {
        if (!options.contentDir || !ctx.server) return

        if (!contentLoaded) {
          const mod = await ctx.server.ssrLoadModule(`${SSG_SRC_DIR}/content.ts`)
          await mod.preloadContent(resolve(config.root, options.contentDir))
          cachedContentJson = mod.serializeContentCacheForClient()
          contentLoaded = true
        }

        const safeJson = cachedContentJson.replace(/<\//g, '<\\/')
        return [
          {
            tag: 'script',
            children: `window.__SSG_CONTENT__=${safeJson}`,
            injectTo: 'head-prepend' as const,
          },
        ]
      },

      configureServer(server) {
        if (!options.contentDir) return

        const contentDir = resolve(config.root, options.contentDir)

        server.watcher.add(contentDir)
        const invalidate = (file: string) => {
          if (file.startsWith(contentDir) && file.endsWith('.md')) {
            contentLoaded = false
            server.ws.send({ type: 'full-reload' })
          }
        }
        server.watcher.on('change', invalidate)
        server.watcher.on('add', invalidate)
        server.watcher.on('unlink', invalidate)
      },
    },

    {
      name: 'gea-ssg:preview',

      configResolved(resolvedConfig) {
        config = resolvedConfig
      },

      configurePreviewServer(server) {
        const ts = options.trailingSlash !== false

        server.middlewares.use((req, res, next) => {
          if (!req.url || extname(req.url) || req.url === '/') return next()

          const url = req.url.split('?')[0]
          const testPath = ts ? join(config.build.outDir, url, 'index.html') : join(config.build.outDir, url + '.html')

          if (existsSync(testPath)) {
            req.url = ts ? (url.endsWith('/') ? url + 'index.html' : url + '/index.html') : url + '.html'
            return next()
          }

          const notFoundPath = join(config.build.outDir, '404.html')
          if (existsSync(notFoundPath)) {
            res.statusCode = 404
            createReadStream(notFoundPath).pipe(res)
            return
          }

          next()
        })
      },
    },
  ]
}
