import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaPlugin } from '../../../packages/vite-plugin-gea/index.ts'
import { geaSSR } from '../../../packages/gea-ssr/src/vite.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  plugins: [geaPlugin(), geaSSR()],
  resolve: {
    alias: {
      '@geajs/core': resolve(__dirname, '../../../packages/gea/src'),
    },
  },
  server: { port: 5191 },
})
