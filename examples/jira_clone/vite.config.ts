import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { geaUiDevSourcePlugin, geaViteAliases } from '../shared/vite-config-base'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index.ts'
import { mockApiMiddleware } from './mock-api.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  plugins: [
    geaUiDevSourcePlugin(),
    geaPlugin(),
    tailwindcss(),
    {
      name: 'mock-api',
      configureServer(server) {
        mockApiMiddleware(server)
      },
    },
  ],
  resolve: {
    alias: geaViteAliases(__dirname),
  },
  server: {
    port: 3000,
    open: true,
  },
})
