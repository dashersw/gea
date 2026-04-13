import { defineConfig } from 'vite'
import { resolve } from 'path'
import { geaPlugin } from '../packages/vite-plugin-gea/src/index.ts'

const geaRoot = resolve(__dirname, '..')

export default defineConfig({
  plugins: [geaPlugin()],
  build: {
    outDir: 'dist',
    lib: {
      entry: 'src/main.js',
      name: 'app',
      formats: ['iife'],
      fileName: () => 'main.js',
    },
    minify: 'esbuild',
  },
  resolve: {
    alias: [
      { find: '@geajs/core', replacement: resolve(geaRoot, 'packages/gea/src') },
      { find: 'gea', replacement: resolve(geaRoot, 'packages/gea/src') },
    ],
  },
})
