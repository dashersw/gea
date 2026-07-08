import { defineConfig } from 'tsdown'
import { geaPlugin } from '../vite-plugin-gea/src/index'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  plugins: [geaPlugin() as any],
  format: 'esm',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: { build: true },
  target: 'es2022',
  platform: 'browser',
  external: ['@geajs/core', '@geajs/ui'],
  define: { 'import.meta.hot': 'undefined', 'import.meta.url': '""' },
  hash: false,
  fixedExtension: true,
})
