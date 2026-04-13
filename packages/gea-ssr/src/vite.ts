import type { Plugin, ViteDevServer, UserConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flattenHeaders, copyHeadersToNodeResponse } from './types'
import { pipeToNodeResponse } from './node'

const ASSET_EXT_RE =
  /\.(?:js|css|ts|tsx|jsx|json|map|png|jpe?g|gif|svg|ico|webp|avif|woff2?|ttf|eot|mp[34]|webm|ogg|wav)$/i

export interface GeaSSROptions {
  serverEntry?: string
}

export function geaSSR(options?: GeaSSROptions): Plugin {
  const serverEntry = options?.serverEntry ?? './server.ts'
  let root = ''

  return {
    name: 'gea-ssr',

    configResolved(config) {
      root = config.root
    },

    config(config: UserConfig) {
      const result: Partial<UserConfig> = {
        // Disable Vite's built-in SPA fallback (history API fallback) so that
        // req.url is not rewritten to /index.html — SSR handles routing itself.
        appType: 'custom',
      }
      if (config.build?.ssr) {
        const configRoot = config.root ?? process.cwd()
        result.build = {
          ssr: true,
          rollupOptions: {
            input: resolve(configRoot, serverEntry),
          },
        }
      }
      return result
    },

    configureServer(server: ViteDevServer) {
      return () => {
        server.middlewares.use(async (req, res, next) => {
          // Use originalUrl to bypass URL rewriting by upstream middleware
          const url = 'originalUrl' in req && typeof req.originalUrl === 'string' ? req.originalUrl : (req.url ?? '/')

          // Skip asset requests
          const pathname = url.split('?')[0]
          if (url.startsWith('/@') || url.startsWith('/node_modules') || ASSET_EXT_RE.test(pathname)) {
            return next()
          }

          try {
            const entryPath = resolve(root, serverEntry)
            const mod = await server.ssrLoadModule(entryPath)
            const handler: unknown = mod.default

            if (typeof handler !== 'function') {
              console.error('[gea-ssr] server entry must export default a request handler')
              return next()
            }

            let indexHtml = readFileSync(resolve(root, 'index.html'), 'utf-8')
            indexHtml = await server.transformIndexHtml(url, indexHtml)

            const protocol = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http'
            const host = req.headers.host ?? 'localhost'
            const fullUrl = `${protocol}://${host}${url}`
            const hasBody = req.method !== 'GET' && req.method !== 'HEAD'

            let body: ReadableStream<Uint8Array> | null = null
            if (hasBody) {
              body = new ReadableStream({
                start(controller) {
                  req.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
                  req.on('end', () => controller.close())
                  req.on('error', (err: Error) => controller.error(err))
                },
              })
            }

            const request = new Request(fullUrl, {
              method: req.method,
              headers: flattenHeaders(req.headers),
              ...(body ? { body, duplex: 'half' as const } : {}),
            })

            const result: unknown = await handler(request, { indexHtml })

            if (!(result instanceof Response)) {
              console.error('[gea-ssr] handler must return a Response instance')
              return next()
            }

            res.statusCode = result.status
            copyHeadersToNodeResponse(result.headers, res)

            if (result.body) {
              await pipeToNodeResponse(result.body, res)
            } else {
              res.end()
            }
          } catch (error) {
            if (error instanceof Error) {
              server.ssrFixStacktrace(error)
            }
            console.error('[gea-ssr] SSR error:', error)
            next(error)
          }
        })
      }
    },
  }
}
