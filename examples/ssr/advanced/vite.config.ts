import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { geaPlugin } from '../../../packages/vite-plugin-gea/src/index.ts'
import { geaSSR } from '../../../packages/gea-ssr/src/vite.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

function devMiddleware(): Plugin {
  return {
    name: 'dev-middleware',
    configureServer(server) {
      // Debug endpoint: read afterResponse side-channel
      server.middlewares.use('/_debug/last-hook', async (_req, res) => {
        try {
          const mod = await server.ssrLoadModule('./server.ts')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ route: mod.lastAfterResponseRoute }))
        } catch {
          res.statusCode = 500
          res.end('{}')
        }
      })

      // Custom /deferred handler using createSSRStream with deferred chunks
      server.middlewares.use('/deferred', async (req, res, next) => {
        if (req.url && req.url !== '/' && req.url !== '') return next()
        try {
          const indexHtml = await server.transformIndexHtml(
            '/deferred',
            readFileSync(resolve(__dirname, 'index.html'), 'utf-8'),
          )
          const mod = await server.ssrLoadModule('./server.ts')
          const response = await mod.handleDeferredRequest(indexHtml)
          res.statusCode = response.status
          response.headers.forEach((v: string, k: string) => res.setHeader(k, v))
          const reader = response.body!.getReader()
          const pump = async (): Promise<void> => {
            const { done, value } = await reader.read()
            if (done) { res.end(); return }
            res.write(value)
            await pump()
          }
          await pump()
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [devMiddleware(), geaPlugin(), geaSSR()],
  resolve: {
    alias: {
      '@geajs/core': resolve(__dirname, '../../../packages/gea/src'),
    },
  },
  server: { port: 5196 },
})
