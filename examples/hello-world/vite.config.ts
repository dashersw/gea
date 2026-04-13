import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaCoreAliases } from '../shared/vite-config-base'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(__dirname, 'src'),
  plugins: [geaPlugin()],
  resolve: {
    alias: [...geaCoreAliases(resolve(__dirname, '../../packages'))],
  },
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
})
