import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index.ts'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import tailwindPreset from '../../packages/gea-ui/src/tailwind-preset.ts'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const geaUiRoot = resolve(repoRoot, 'packages/gea-ui')

/** `@geajs/core/router` must resolve before the `@geajs/core` directory alias. */
export function geaCoreAliases(packagesDir: string) {
  return [
    { find: '@geajs/core/router', replacement: resolve(packagesDir, 'gea/src/lib/router/index.ts') },
    { find: '@geajs/core', replacement: resolve(packagesDir, 'gea/src') },
  ]
}

/** Resolves `@geajs/ui/name` to component source so dev only loads used modules. */
export function geaViteAliases(exampleDir: string) {
  const packagesDir = resolve(exampleDir, '../../packages')
  return [
    ...geaCoreAliases(packagesDir),
    {
      find: /^@geajs\/ui\/([a-z][\w-]*)$/,
      replacement: resolve(packagesDir, 'gea-ui/src/components/$1'),
    },
    { find: '@geajs/ui', replacement: resolve(packagesDir, 'gea-ui/src') },
  ]
}

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
      alias: geaViteAliases(__dirname),
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
