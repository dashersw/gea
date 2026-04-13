import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { geaSSR } from '../src/vite.ts'

// Extract plugin hooks via property access — the Plugin type has known hook names
function getPlugin(options?: Parameters<typeof geaSSR>[0]) {
  const plugin = geaSSR(options)
  const p = plugin as Record<string, unknown>
  return {
    config: p.config as (config: Record<string, unknown>) => Record<string, unknown>,
    configResolved: p.configResolved as (config: { root: string }) => void,
    configureServer: p.configureServer as (server: Record<string, unknown>) => () => void,
  }
}

describe('geaSSR vite plugin', () => {
  describe('config()', () => {
    it('sets appType to custom', () => {
      const { config } = getPlugin()
      const result = config({ build: {} })
      assert.equal(result.appType, 'custom')
    })

    it('configures SSR build with default server entry', () => {
      const { config } = getPlugin()
      const result = config({ build: { ssr: true } })
      const build = result.build as Record<string, unknown>
      assert.equal(build.ssr, true)
      const rollup = build.rollupOptions as Record<string, unknown>
      assert.ok(String(rollup.input).endsWith('/server.ts'))
    })

    it('configures SSR build with custom server entry', () => {
      const { config } = getPlugin({ serverEntry: './app-server.ts' })
      const result = config({ build: { ssr: true }, root: '/project' })
      const build = result.build as Record<string, unknown>
      const rollup = build.rollupOptions as Record<string, unknown>
      assert.ok(String(rollup.input).endsWith('/app-server.ts'))
    })

    it('does not set rollupOptions when build.ssr is falsy', () => {
      const { config } = getPlugin()
      const result = config({ build: {} })
      assert.equal(result.build, undefined)
    })
  })

  describe('configureServer() middleware', () => {
    function createMockServer(mod: Record<string, unknown> = {}) {
      const middlewareFns: Function[] = []
      return {
        middlewares: {
          use(fn: Function) {
            middlewareFns.push(fn)
          },
        },
        ssrLoadModule: async () => mod,
        transformIndexHtml: async (_url: string, html: string) => html,
        ssrFixStacktrace: (_e: Error) => {},
        _getMiddleware() {
          return middlewareFns[0]
        },
      }
    }

    function createMockReq(url: string, method = 'GET') {
      return {
        url,
        originalUrl: url,
        method,
        headers: { host: 'localhost:3000' },
        socket: {},
        on: () => {},
      }
    }

    function createMockRes() {
      const emitter = new EventEmitter()
      const chunks: Uint8Array[] = []
      let ended = false
      let statusCode = 200
      const headers: Record<string, string | string[]> = {}
      return Object.assign(emitter, {
        get statusCode() {
          return statusCode
        },
        set statusCode(v: number) {
          statusCode = v
        },
        setHeader(name: string, value: string | string[]) {
          headers[name] = value
        },
        write(chunk: Uint8Array) {
          chunks.push(chunk)
          return true
        },
        end() {
          ended = true
        },
        get _headers() {
          return headers
        },
        get _chunks() {
          return chunks
        },
        get _ended() {
          return ended
        },
      })
    }

    it('skips asset requests (.js, .css, .png, .woff2, .svg)', async () => {
      const { configResolved, configureServer } = getPlugin()
      configResolved({ root: '/project' })
      const server = createMockServer()
      const setup = configureServer(server)
      setup()
      const middleware = server._getMiddleware()

      for (const assetUrl of ['/main.js', '/style.css', '/logo.png', '/font.woff2', '/image.svg']) {
        let nextCalled = false
        await middleware(createMockReq(assetUrl), createMockRes(), () => {
          nextCalled = true
        })
        assert.ok(nextCalled, `should call next() for ${assetUrl}`)
      }
    })

    it('skips @vite and node_modules requests', async () => {
      const { configResolved, configureServer } = getPlugin()
      configResolved({ root: '/project' })
      const server = createMockServer()
      const setup = configureServer(server)
      setup()
      const middleware = server._getMiddleware()

      for (const url of ['/@vite/client', '/node_modules/foo']) {
        let nextCalled = false
        await middleware(createMockReq(url), createMockRes(), () => {
          nextCalled = true
        })
        assert.ok(nextCalled, `should call next() for ${url}`)
      }
    })

    it('passes error to next() when index.html is missing', async () => {
      const { configResolved, configureServer } = getPlugin()
      configResolved({ root: '/nonexistent-path' })
      const server = createMockServer({ default: () => new Response('ok') })
      const setup = configureServer(server)
      setup()
      const middleware = server._getMiddleware()

      let errorPassed: unknown = null
      await middleware(createMockReq('/'), createMockRes(), (err?: unknown) => {
        errorPassed = err
      })
      assert.ok(errorPassed !== null, 'should pass error to next()')
    })

    it('calls ssrFixStacktrace on Error instances', async () => {
      let fixedError: Error | null = null
      const { configResolved, configureServer } = getPlugin()
      configResolved({ root: '/nonexistent-path' })
      // Provide a valid handler so readFileSync is reached and throws
      const server = createMockServer({ default: () => new Response('ok') })
      server.ssrFixStacktrace = (e: Error) => {
        fixedError = e
      }
      const setup = configureServer(server)
      setup()
      const middleware = server._getMiddleware()

      await middleware(createMockReq('/'), createMockRes(), () => {})
      assert.ok(fixedError instanceof Error)
    })
  })
})
