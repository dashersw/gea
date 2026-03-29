#!/usr/bin/env node
/**
 * Copies @geajs/core ESM output into the static website playground so preview.js can fetch it.
 * Run after: npm run build -w @geajs/core
 */
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'packages/gea/dist/index.mjs')
const srcMap = join(root, 'packages/gea/dist/index.mjs.map')
const dest = join(root, 'website/playground/gea-core.js')
const destMap = join(root, 'website/playground/index.mjs.map')

if (!existsSync(src)) {
  console.error('Missing packages/gea/dist/index.mjs — run: npm run build -w @geajs/core')
  process.exit(1)
}

copyFileSync(src, dest)

if (existsSync(srcMap)) {
  copyFileSync(srcMap, destMap)
  console.log('Synced website/playground/gea-core.js and index.mjs.map')
} else {
  console.warn('Warning: packages/gea/dist/index.mjs.map not found (source maps will not resolve).')
  console.log('Synced website/playground/gea-core.js')
}
