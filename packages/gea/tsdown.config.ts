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
  minify: true,
  define: {
    'import.meta.hot': 'undefined',
    'import.meta.url': '""',
  },
  hash: false,
  fixedExtension: true,
}

const browserRouterExternals = ['../store', '../runtime/component', 'store', 'runtime/component']
export default defineConfig([
  {
    entry: {
      index: 'src/index.ts',
      'compiler-runtime': 'src/compiler-runtime.ts',
      'jsx-runtime': 'src/jsx-runtime.ts',
      'jsx-dev-runtime': 'src/jsx-dev-runtime.ts',
      router: 'src/router-entry.ts',
    },
    ...esmOpts,
    clean: true,
  },
  {
    entry: {
      ssr: 'src/ssr.ts',
    },
    ...esmOpts,
    clean: false,
    // SSR bridge is tiny (re-exports internal helpers); bundle inline so the
    // output resolves without separate chunks for uid.ts / store.ts.
  },
  {
    entry: {
      'gea-runtime': 'src/runtime-only-browser.ts',
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
  {
    entry: {
      'gea-router': 'src/router-entry.ts',
    },
    format: 'iife',
    globalName: 'geaRouter',
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
    deps: {
      neverBundle: browserRouterExternals,
    },
    hash: false,
    outputOptions: {
      exports: 'named',
      entryFileNames: '[name].js',
      globals: () => 'gea',
    },
  },
])
