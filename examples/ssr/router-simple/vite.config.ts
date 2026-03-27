import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { geaCoreAliases } from '../../shared/vite-config-base'
import { geaPlugin } from '../../../packages/vite-plugin-gea/src/index.ts'
import { geaSSR } from '../../../packages/gea-ssr/src/vite.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  plugins: [geaPlugin(), geaSSR()],
  resolve: {
    alias: [...geaCoreAliases(resolve(__dirname, '../../../packages'))],
  },
  server: { port: 5194 },
})
