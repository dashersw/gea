import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaCoreAliases } from '../shared/vite-config-base'
import { geaPlugin } from '../../packages/vite-plugin-gea/src/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(__dirname, 'src'),
  plugins: [geaPlugin()],
  resolve: {
    alias: [
      ...geaCoreAliases(resolve(__dirname, '../../packages')),
      { find: '@geajs/mobile', replacement: resolve(__dirname, '../../packages/gea-mobile/src') },
    ],
  },
  server: {
    port: 5184,
    open: true,
    allowedHosts: ['0858-2a02-2455-8219-2500-c09c-ec4a-749c-d2e4.ngrok-free.app'],
  },
})
