import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaUiDevSourcePlugin, geaViteAliases } from '../shared/vite-config-base'
import tailwindcss from '@tailwindcss/vite'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  base: '/docs/gea-ui-showcase/',
  plugins: [
    geaUiDevSourcePlugin(),
    geaPlugin(),
    tailwindcss(),
  ],
  resolve: {
    alias: geaViteAliases(__dirname),
  },
  build: {
    outDir: resolve(__dirname, '../../docs/public/gea-ui-showcase'),
    emptyOutDir: true,
    minify: false,
  },
})
