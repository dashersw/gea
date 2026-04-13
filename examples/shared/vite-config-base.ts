import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index.ts'

/** Rewrites the prod `@source` path in gea-ui's theme.css to scan TS sources in dev. */
export function geaUiDevSourcePlugin(): Plugin {
  return {
    name: 'gea-ui-dev-source',
    enforce: 'pre',
    transform(code, id) {
      if (id.split('?')[0].endsWith('gea-ui/src/styles/theme.css')) {
        return {
          code: code.replace('@source "./**/*.mjs";', '@source "../**/*.{ts,tsx}";'),
          map: null,
        }
      }
    },
  }
}

/** `@geajs/core/router` must resolve before the `@geajs/core` directory alias. */
export function geaCoreAliases(packagesDir: string) {
  return [
    { find: '@geajs/core/jsx-dev-runtime', replacement: resolve(packagesDir, 'gea/src/jsx-dev-runtime.ts') },
    { find: '@geajs/core/jsx-runtime', replacement: resolve(packagesDir, 'gea/src/jsx-runtime.ts') },
    { find: '@geajs/core/router', replacement: resolve(packagesDir, 'gea/src/router/index.ts') },
    { find: '@geajs/core/ssr', replacement: resolve(packagesDir, 'gea/src/ssr.ts') },
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
    plugins: [geaUiDevSourcePlugin(), geaPlugin(), tailwindcss()],
    // No jsx-runtime — the gea plugin compiles every JSX site. If esbuild saw a
    // JSX element here it would try to auto-import jsx-dev-runtime, which no
    // longer exists. `preserve` means esbuild leaves JSX untouched; the gea
    // plugin (enforce:"pre") must have already rewritten it.
    esbuild: { jsx: 'preserve' },
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
