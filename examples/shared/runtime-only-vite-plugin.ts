import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))
/** Monorepo root (`examples/shared` → `../..`). */
const REPO_ROOT = resolve(__dirname, '../..')

/**
 * Serves `/vendor/gea.js` from `packages/gea/dist/gea.js` and
 * `/vendor/babel.min.js` from `tests/e2e/vendor/babel.min.js` so runtime-only
 * examples avoid CDN fetches during dev and e2e.
 */
export function runtimeOnlyVendorPlugin(): Plugin {
  return {
    name: 'gea-runtime-only-vendor',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? ''
        if (pathname === '/vendor/gea.js') {
          try {
            const buf = readFileSync(resolve(REPO_ROOT, 'packages/gea/dist/gea.js'))
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
            res.end(buf)
          } catch {
            res.statusCode = 404
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('packages/gea/dist/gea.js not found — run: npm run build -w @geajs/core')
          }
          return
        }
        if (pathname === '/vendor/babel.min.js') {
          try {
            const buf = readFileSync(resolve(REPO_ROOT, 'tests/e2e/vendor/babel.min.js'))
            res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
            res.end(buf)
          } catch {
            res.statusCode = 404
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('tests/e2e/vendor/babel.min.js missing — run: node scripts/fetch-e2e-babel-vendor.mjs')
          }
          return
        }
        next()
      })
    },
  }
}
