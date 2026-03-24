import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index.ts'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import tailwindPreset from '../../packages/gea-ui/src/tailwind-preset.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const geaUiRoot = resolve(repoRoot, 'packages/gea-ui')

export function createConfig(metaUrl: string, port: number) {
  const __dirname = dirname(fileURLToPath(metaUrl))
  return defineConfig({
    root: __dirname,
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
    cacheDir: resolve(__dirname, 'node_modules/.vite'),
    optimizeDeps: {
      entries: ['index.html'],
    },
    server: {
      port,
      open: false,
    },
  })
}
