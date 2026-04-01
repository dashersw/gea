import { defineConfig } from 'tsup'
import { copyFileSync } from 'node:fs'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  target: 'es2022',
  platform: 'browser',
  external: ['@geajs/core', /^@zag-js\//],
  onSuccess() {
    copyFileSync('src/styles/theme.css', 'dist/theme.css')
    console.log('Copied theme.css to dist/')
  },
})
