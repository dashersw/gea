import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index.ts'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import tailwindPreset from '../../packages/gea-ui/src/tailwind-preset.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '../..')
const geaUiRoot = resolve(repoRoot, 'packages/gea-ui')

export default defineConfig({
  root: __dirname,
  base: '/docs/gea-ui-showcase/',
  plugins: [geaPlugin()],
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: [resolve(geaUiRoot, 'src/**/*.{ts,tsx}')],
          safelist: ['dark'],
          presets: [tailwindPreset],
        } as any),
        autoprefixer(),
      ],
    },
  },
  resolve: {
    alias: {
      '@geajs/core': resolve(__dirname, '../../packages/gea/src'),
      '@geajs/ui': resolve(__dirname, '../../packages/gea-ui/src'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../../docs/public/gea-ui-showcase'),
    emptyOutDir: true,
    minify: false,
  },
})
