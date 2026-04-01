#!/usr/bin/env node
/**
 * Runs the benchmark profiler in a headless Chromium browser and collects results.
 * Usage: node benchmark/run-profile.mjs
 */

import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync } from 'fs'
import { join, extname } from 'path'

const BENCHMARK_DIR = new URL('.', import.meta.url).pathname

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
}

// Simple static file server
function startServer(port) {
  return new Promise((resolve_) => {
    const server = createServer((req, res) => {
      const filePath = join(BENCHMARK_DIR, req.url === '/' ? 'profile.html' : req.url)
      // Handle /css/currentStyle.css → just serve empty
      if (req.url.startsWith('/css/')) {
        res.writeHead(200, { 'Content-Type': 'text/css' })
        res.end('')
        return
      }
      if (!existsSync(filePath)) {
        res.writeHead(404)
        res.end('Not found')
        return
      }
      const ext = extname(filePath)
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' })
      res.end(readFileSync(filePath))
    })
    server.listen(port, () => resolve_({ server, port }))
  })
}

async function main() {
  const { server, port } = await startServer(9876)
  console.log(`Static server on http://localhost:${port}`)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Collect console output
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[browser]', msg.text())
  })

  await page.goto(`http://localhost:${port}/profile.html`)

  // Wait for app to render
  await page.waitForFunction(
    () => {
      const el = document.querySelector('#main > *')
      return el !== null
    },
    { timeout: 5000 },
  )

  console.log('App loaded. Instrumenting and running profile...\n')

  // Instrument and run
  const results = await page.evaluate(async () => {
    const p = window.__geaProfiler
    if (!p.instrument()) throw new Error('Instrumentation failed')

    const results = await p.runAllProfiles()
    return {
      formatted: p.formatResults(results),
      json: p.exportJSON(results),
      comparison: p.exportComparisonPairs(results),
    }
  })

  console.log(results.formatted)

  if (results.comparison && results.comparison.length) {
    console.log('\n── Direct vs click (avg ms) ──────────────────────────────')
    for (const row of results.comparison) {
      console.log(
        `  ${row.name.padEnd(40)} direct ${String(row.avgTotalMsDirect).padStart(8)}  click ${String(row.avgTotalMsClick).padStart(8)}  Δ ${String(row.deltaTotalMs).padStart(8)}  (sync Δ ${String(row.deltaSyncMs).padStart(8)})`,
      )
    }
  }

  // Also output JSON summary
  console.log('\n── JSON Summary ─────────────────────────────────────────')
  for (const [, data] of Object.entries(results.json)) {
    console.log(`\n${data.name} (${data.avgTotalMs}ms avg):`)
    const sorted = Object.entries(data.breakdown).sort((a, b) => b[1].avgMs - a[1].avgMs)
    for (const [cat, info] of sorted) {
      if (info.avgMs >= 0.01) {
        console.log(
          `  ${cat.padEnd(50)} ${info.avgMs.toFixed(3).padStart(8)}ms  ${String(info.avgCalls).padStart(6)} calls  ${info.pctOfTotal.toFixed(1).padStart(6)}%`,
        )
      }
    }
  }

  await browser.close()
  server.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
