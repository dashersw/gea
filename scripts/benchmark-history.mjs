import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function safeGit(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

export function appendBenchmarkHistoryEntry({ historyPath, latestPath, entry }) {
  ensureParentDir(historyPath)
  ensureParentDir(latestPath)
  appendFileSync(historyPath, `${JSON.stringify(entry)}\n`, 'utf8')
  writeFileSync(latestPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8')
  return entry
}

export function createBenchmarkHistoryEntry({
  suite,
  source,
  changeSummary,
  config,
  results,
  historyPath,
  latestPath,
  extra = {},
}) {
  const ts = new Date().toISOString()
  const sha = safeGit('git', ['rev-parse', 'HEAD']) ?? 'unknown'
  const branch = safeGit('git', ['rev-parse', '--abbrev-ref', 'HEAD']) ?? 'unknown'
  const dirtyOutput = safeGit('git', ['status', '--porcelain'])
  const dirty = dirtyOutput != null && dirtyOutput.length > 0
  const id = createHash('sha1').update(`${ts}:${suite}:${changeSummary}:${randomUUID()}`).digest('hex').slice(0, 12)

  const entry = {
    id,
    ts,
    suite,
    source,
    git: { sha, branch, dirty },
    change: { summary: changeSummary },
    env: {
      node: process.version,
      os: process.platform,
      arch: process.arch,
    },
    config,
    results,
    ...extra,
  }

  return appendBenchmarkHistoryEntry({ historyPath, latestPath, entry })
}
