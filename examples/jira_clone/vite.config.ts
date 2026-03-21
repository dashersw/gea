import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaPlugin } from '../../packages/vite-plugin-gea/index.ts'
import { mockApiMiddleware } from './mock-api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  plugins: [
    geaPlugin(),
    {
      name: 'mock-api',
      configureServer(server) {
        mockApiMiddleware(server)
      },
    },
  ],
  resolve: {
    alias: {
      '@geajs/core': resolve(__dirname, '../../packages/gea/src'),
      '@geajs/ui': resolve(__dirname, '../../packages/gea-ui/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})
