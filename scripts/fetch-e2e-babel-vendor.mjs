#!/usr/bin/env node
/**
 * Downloads @babel/standalone into tests/e2e/vendor/babel.min.js (pinned version).
 * Run when bumping Babel: node scripts/fetch-e2e-babel-vendor.mjs
 */
import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '7.26.10'
const url = `https://unpkg.com/@babel/standalone@${VERSION}/babel.min.js`
const __dirname = dirname(fileURLToPath(import.meta.url))
const out = join(__dirname, '../tests/e2e/vendor/babel.min.js')

const res = await fetch(url)
if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`)
await mkdir(dirname(out), { recursive: true })
await writeFile(out, Buffer.from(await res.arrayBuffer()))
const s = await stat(out)
console.log(`wrote ${out} (${(s.size / 1024).toFixed(0)} KiB, @babel/standalone@${VERSION})`)
