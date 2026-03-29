import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { runtimeOnlyVendorPlugin } from '../shared/runtime-only-vite-plugin'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: __dirname,
  plugins: [runtimeOnlyVendorPlugin()],
})
