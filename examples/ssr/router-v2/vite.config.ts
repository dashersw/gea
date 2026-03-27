import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { geaCoreAliases } from '../../shared/vite-config-base'
import { geaPlugin } from '../../../packages/vite-plugin-gea/index.ts'
import { geaSSR } from '../../../packages/gea-ssr/src/vite.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

const originalAuthStore = resolve(__dirname, '../../router-v2/src/stores/auth-store.ts')
const ssrAuthStore = resolve(__dirname, 'src/stores/auth-store.ts')

function authStoreRedirect(): Plugin {
  return {
    name: 'auth-store-ssr-redirect',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null
      if (source.includes('auth-store') && !importer.includes('ssr/router-v2/src/stores')) {
        const resolved = resolve(dirname(importer), source)
        if (resolved === originalAuthStore || resolved + '.ts' === originalAuthStore) {
          return ssrAuthStore
        }
      }
      return null
    },
  }
}

export default defineConfig({
  root: __dirname,
  plugins: [authStoreRedirect(), geaPlugin(), geaSSR()],
  resolve: {
    alias: [...geaCoreAliases(resolve(__dirname, '../../../packages'))],
  },
  server: { port: 5195 },
})
