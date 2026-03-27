import { defineConfig } from 'tsdown'
import { geaPlugin } from '../vite-plugin-gea/src/index'

const esmOpts = {
  plugins: [geaPlugin() as any],
  format: 'esm' as const,
  outDir: 'dist',
  sourcemap: true,
  dts: { build: true },
  target: 'es2022' as const,
  platform: 'browser' as const,
  define: {
    'import.meta.hot': 'undefined',
    'import.meta.url': '""',
  },
  hash: false,
  fixedExtension: true,
}

export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
    },
    ...esmOpts,
    clean: true,
  },
  {
    entry: {
      router: 'src/lib/router/index.ts',
    },
    ...esmOpts,
    clean: false,
  },
  {
    entry: {
      gea: 'src/index.ts',
    },
    format: 'iife',
    globalName: 'gea',
    outDir: 'dist',
    clean: false,
    minify: true,
    sourcemap: true,
    target: 'es2022',
    platform: 'browser',
    define: {
      'import.meta.hot': 'undefined',
      'import.meta.url': '""',
    },
    hash: false,
    outputOptions: {
      exports: 'named',
      entryFileNames: '[name].js',
    },
  },
])
