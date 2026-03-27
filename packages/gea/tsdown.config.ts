import { defineConfig } from 'tsdown'
import { geaPlugin } from '../vite-plugin-gea/src/index'

export default defineConfig([
  {
    entry: ['src/index.ts', 'src/jsx-runtime.ts'],
    plugins: [geaPlugin() as any],
    format: 'esm',
    outDir: 'dist',
    sourcemap: true,
    dts: { build: true },
    target: 'es2022',
    platform: 'browser',
    define: {
      'import.meta.hot': 'undefined',
      'import.meta.url': '""',
    },
    hash: false,
    fixedExtension: true,
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
