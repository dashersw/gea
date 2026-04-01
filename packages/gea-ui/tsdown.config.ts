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
    const srcPath = resolve(__dirname, 'src/styles/theme.css')
    const distPath = resolve(__dirname, 'dist/theme.css')
    const search = '@source "../**/*.{ts,tsx}";'
    const src = readFileSync(srcPath, 'utf8')

    // Replace source scan path from dev to prod
    if (!src.includes(search)) {
      throw new Error(`Expected ${search} in ${srcPath}`)
    }

    const dist = src.replace(search, '@source "./**/*.mjs";')
    writeFileSync(distPath, dist)
    console.log('Copied theme.css to dist/')
  },
})
