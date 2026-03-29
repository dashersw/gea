import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { appendBenchmarkHistoryEntry } from '../../../scripts/benchmark-history.mjs'

test('appendBenchmarkHistoryEntry writes JSONL history and latest snapshot', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gea-benchmark-history-'))
  const historyPath = join(dir, 'benchmark-simulation.jsonl')
  const latestPath = join(dir, 'benchmark-simulation.latest.json')

  const entry = appendBenchmarkHistoryEntry({
    historyPath,
    latestPath,
    entry: {
      id: 'test-run',
      ts: '2026-03-29T00:00:00.000Z',
      suite: 'benchmark-simulation',
      source: 'simulation',
      git: {
        sha: 'abc123',
        branch: 'main',
        dirty: true,
      },
      change: {
        summary: 'baseline before derived map lowering',
      },
      env: {
        node: 'v24.8.0',
        os: 'darwin',
        arch: 'arm64',
      },
      config: {
        warmup: 3,
        runs: 7,
      },
      results: {
        selectRow: {
          vanilla: 0.05,
          gea: 1.5,
          slowdown: 30,
        },
      },
    },
  })

  assert.equal(entry.change.summary, 'baseline before derived map lowering')

  const historyLines = readFileSync(historyPath, 'utf8').trim().split('\n')
  assert.equal(historyLines.length, 1)
  assert.deepEqual(JSON.parse(historyLines[0]), entry)

  const latest = JSON.parse(readFileSync(latestPath, 'utf8'))
  assert.deepEqual(latest, entry)
})
