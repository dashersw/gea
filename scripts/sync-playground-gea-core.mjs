#!/usr/bin/env node
/**
 * Builds the self-contained Gea runtime module used by the website playground.
 * Run after: npm run build -w @geajs/core
 */
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const dist = join(root, 'packages/gea/dist')
const playground = join(root, 'website/playground')
const coreEntry = join(dist, 'index.mjs')
const compilerRuntimeEntry = join(dist, 'compiler-runtime.mjs')
const outfile = join(playground, 'gea-playground-runtime.js')

if (!existsSync(coreEntry) || !existsSync(compilerRuntimeEntry)) {
  console.error('Missing @geajs/core dist files — run: npm run build -w @geajs/core')
  process.exit(1)
}

const entry = `
export * from ${JSON.stringify(coreEntry)}
// Explicit exports take precedence over overlapping core star exports. Derive
// this list from the built runtime so new compiler helpers cannot go missing.
export { ${Object.keys(await import(pathToFileURL(compilerRuntimeEntry).href)).join(', ')} } from ${JSON.stringify(compilerRuntimeEntry)}
`

await build({
  stdin: {
    contents: entry,
    resolveDir: root,
    sourcefile: 'gea-playground-runtime-entry.js',
    loader: 'js',
  },
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: true,
  logLevel: 'silent',
})

for (const staleFile of [
  'gea-core.js',
  'index.mjs.map',
  'compiler-runtime.mjs',
  'compiler-runtime.mjs.map',
  'component.mjs',
  'component.mjs.map',
  'router-view.mjs',
  'router-view.mjs.map',
]) {
  const path = join(playground, staleFile)
  if (existsSync(path)) rmSync(path)
}

console.log('Built website/playground/gea-playground-runtime.js')
