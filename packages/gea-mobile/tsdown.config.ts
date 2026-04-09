import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: 'esm',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: { build: true },
  target: 'es2022',
  platform: 'browser',
  deps: { neverBundle: ['@geajs/core'] },
  fixedExtension: true,
})
