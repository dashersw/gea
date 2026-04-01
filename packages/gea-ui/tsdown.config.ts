import { defineConfig } from 'tsdown'
import { geaPlugin } from '../vite-plugin-gea/src/index'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, parse, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const componentsDir = resolve(__dirname, 'src/components')
const componentEntries = Object.fromEntries(
  readdirSync(componentsDir)
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => [parse(f).name, `src/components/${f}`]),
)

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    ...componentEntries,
  },
  plugins: [geaPlugin() as any],
  format: 'esm',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  dts: { build: true },
  target: 'es2022',
  platform: 'browser',
  external: ['@geajs/core', /^@zag-js\//],
  define: {
    'import.meta.hot': 'undefined',
    'import.meta.url': '""',
  },
  hash: false,
  fixedExtension: true,
  onSuccess() {
    const src = readFileSync('src/styles/theme.css', 'utf8')
    // Replace source scan path from dev to prod
    const dist = src.replace('@source "../**/*.{ts,tsx}";', '@source "./**/*.mjs";')
    writeFileSync('dist/theme.css', dist)
    console.log('Copied theme.css to dist/')
  },
})
