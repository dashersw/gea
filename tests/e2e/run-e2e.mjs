#!/usr/bin/env node
// E2E entry point. Runs the Playwright suite either all-at-once (default) or in
// batches of N examples so the machine never starts all ~22 dev servers at once:
//
//   npm run test:e2e                     # all examples (original behavior)
//   npm run test:e2e -- --batch_size=5   # 5 examples per batch, batches run sequentially
//   npm run test:e2e -- --batch-size 3 chat.spec.ts   # extra args pass through to Playwright
//
// Each batch sets E2E_PROJECT to a comma-list, which the config uses to start
// ONLY that batch's dev servers, run, tear down, then the next batch starts.
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { exampleNames } from './examples.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG = resolve(__dirname, 'playwright.config.ts')
const CLEAR = resolve(__dirname, 'clear-stale-e2e-artifacts.mjs')

// Parse --batch_size / --batch-size / --batchSize (=N or space-separated N).
// Everything else passes through to `playwright test` (spec filters, -g, etc.).
const argv = process.argv.slice(2)
let batchSize = 0
const passthrough = []
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  const m = a.match(/^--batch[_-]?size(?:=(\d+))?$/i)
  if (m) {
    batchSize = m[1] != null ? parseInt(m[1], 10) : parseInt(argv[++i] ?? '', 10)
    continue
  }
  passthrough.push(a)
}
if (!Number.isFinite(batchSize) || batchSize < 0) batchSize = 0

const clearStale = () => spawnSync('node', [CLEAR], { stdio: 'inherit' })

function runPlaywright(env, label) {
  console.log(`\n########## ${label} ##########`)
  const r = spawnSync('npx', ['playwright', 'test', '--config', CONFIG, ...passthrough], {
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  return r.status ?? 1
}

// No (or all-encompassing) batch size → original single all-examples run.
if (batchSize === 0 || batchSize >= exampleNames.length) {
  clearStale()
  process.exit(runPlaywright({}, `E2E: all ${exampleNames.length} examples`))
}

const batchCount = Math.ceil(exampleNames.length / batchSize)
const failures = []
for (let i = 0, b = 1; i < exampleNames.length; i += batchSize, b++) {
  const batch = exampleNames.slice(i, i + batchSize)
  clearStale()
  const code = runPlaywright({ E2E_PROJECT: batch.join(',') }, `E2E BATCH ${b}/${batchCount}: ${batch.join(', ')}`)
  if (code !== 0) failures.push(`batch ${b} [${batch.join(',')}]`)
}

console.log('\n########## E2E BATCH SUMMARY ##########')
if (failures.length === 0) {
  console.log(`✓ ALL ${batchCount} BATCHES GREEN (batch_size=${batchSize})`)
  process.exit(0)
}
console.error(`✗ FAILURES in: ${failures.join(' | ')}`)
process.exit(1)
