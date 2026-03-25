import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'
import { geaSSG } from '@geajs/ssg/vite'

export default defineConfig({
  plugins: [
    geaPlugin(),
    ...geaSSG({
      contentDir: 'src/content',
      sitemap: {
        hostname: 'https://gea-ssg-example.com',
      },
      robots: true,
      minify: true,
    }),
  ],
  resolve: {
    alias: {
      '@geajs/core': resolve(__dirname, '../../packages/gea/src'),
    },
  },
})
