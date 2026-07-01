import { defineConfig, devices } from '@playwright/test'
import { closeSync, existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { examples } from './examples.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const EXAMPLES_ROOT = resolve(REPO_ROOT, 'examples')

const PORT_FILE = resolve(__dirname, '.e2e-ports.json')
const LOCK_FILE = resolve(__dirname, '.e2e-ports.lock')
const SESSION_FILE = resolve(__dirname, '.e2e-session.json')

// When E2E_PROJECT is set (CI matrix or fast local runs), only start that example's webServer.
// Locally unset: every example's vite dev starts so `--project=X` works without extra env—but
// startup is slow because `--project` filters tests only, not webServer entries.
const targetFromEnv = process.env.E2E_PROJECT || ''
// E2E_PROJECT accepts a single example name OR a comma-separated batch
// (e.g. "todo,kanban,chat,docs,forms") so the suite can run in small batches —
// each batch starts ONLY its own dev servers instead of all ~22 at once.
const targetList = targetFromEnv ? targetFromEnv.split(',').map((s) => s.trim()).filter(Boolean) : []

// `examples` (the project + webServer list) is imported from ./examples.mjs so
// the batch runner (run-e2e.mjs) and this config share one canonical list.

/**
 * Workers do not inherit E2E_PROJECT in this setup; the main process writes this file synchronously
 * so workers can resolve the same single-example session.
 */
if (targetFromEnv) {
  writeFileSync(SESSION_FILE, JSON.stringify({ key: targetFromEnv, count: targetList.length }))
}

interface PortFilePayload {
  key: string
  count: number
  ports: number[]
}

function readPortFile(): PortFilePayload | null {
  try {
    if (!existsSync(PORT_FILE)) return null
    const raw = JSON.parse(readFileSync(PORT_FILE, 'utf8')) as PortFilePayload
    if (
      typeof raw.key === 'string' &&
      typeof raw.count === 'number' &&
      Array.isArray(raw.ports) &&
      raw.ports.length === raw.count
    )
      return raw
    return null
  } catch {
    return null
  }
}

function resolveActiveExamples(): ExampleDef[] {
  if (targetList.length) {
    const active = examples.filter((e) => targetList.includes(e.name))
    if (active.length !== targetList.length)
      throw new Error(`E2E_PROJECT "${targetFromEnv}" has unmatched example(s)`)
    return active
  }
  try {
    if (existsSync(SESSION_FILE)) {
      const s = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as { key: string }
      if (s.key !== '__all__') {
        const active = examples.filter((e) => e.name === s.key)
        if (active.length !== 1) throw new Error(`Session key "${s.key}" has no matching example`)
        return active
      }
      return examples
    }
  } catch {
    /* ignore */
  }
  const p = readPortFile()
  if (p) {
    if (p.key !== '__all__') {
      const active = examples.filter((e) => e.name === p.key)
      if (active.length !== 1) throw new Error(`Port file key "${p.key}" has no matching example`)
      return active
    }
    return examples
  }
  return examples
}

function resolveE2eSessionKey(): string {
  if (targetFromEnv) return targetFromEnv
  try {
    if (existsSync(SESSION_FILE)) {
      const s = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as { key: string }
      return s.key
    }
  } catch {
    /* ignore */
  }
  const p = readPortFile()
  if (p) return p.key
  return '__all__'
}

const activeExamples = resolveActiveExamples()
const e2eSessionKey = resolveE2eSessionKey()
const singleExampleRun = activeExamples.length === 1

/** Override with E2E_WORKERS=n. CI defaults lower to reduce RAM on shared runners. */
function resolveWorkerCount(): number {
  const fromEnv = parseInt(process.env.E2E_WORKERS || '', 10)
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
  return 4
}

/** Binds an ephemeral port on 127.0.0.1, then releases it for the dev server to use. */
function getFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const a = s.address()
      if (!a || typeof a === 'string') {
        s.close()
        reject(new Error('invalid listen address'))
        return
      }
      const port = a.port
      s.close((err) => {
        if (err) reject(err)
        else resolvePort(port)
      })
    })
  })
}

/**
 * The config module is evaluated in the main process (webServer) and again in workers (projects).
 * Top-level port allocation must be identical everywhere, so we persist the list once under a lock.
 * `key` distinguishes full-suite runs from E2E_PROJECT runs so stale files are not reused incorrectly.
 */
async function getSharedPorts(count: number): Promise<number[]> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const cached = readPortFile()
    if (cached && cached.key === e2eSessionKey && cached.count === count) return cached.ports

    let lockFd: number
    try {
      lockFd = openSync(LOCK_FILE, 'wx')
    } catch {
      await new Promise((r) => setTimeout(r, 50))
      continue
    }
    try {
      const again = readPortFile()
      if (again && again.key === e2eSessionKey && again.count === count) return again.ports

      try {
        if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE)
      } catch {
        /* ignore */
      }

      const ports = await Promise.all(Array.from({ length: count }, () => getFreePort()))
      writeFileSync(PORT_FILE, JSON.stringify({ key: e2eSessionKey, count, ports } satisfies PortFilePayload))
      return ports
    } finally {
      closeSync(lockFd)
      try {
        unlinkSync(LOCK_FILE)
      } catch {
        /* ignore */
      }
    }
  }
  throw new Error('getSharedPorts: timeout waiting for port allocation')
}

const ports = await getSharedPorts(activeExamples.length)

export default defineConfig({
  globalTeardown: resolve(__dirname, 'e2e-global-teardown.ts'),
  testDir: '.',
  fullyParallel: singleExampleRun,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: resolveWorkerCount(),
  reporter: 'list',
  timeout: 60_000,
  // Cold navigations and assertions under parallel webServers routinely exceed
  // 1-2s on busy machines (each example runs its own Vite dev server). Tight
  // 1.5s/1s defaults flaked intermittently across examples; 10s gives ample
  // headroom while still catching genuine hangs (the 60s per-test cap does).
  expect: { timeout: 10_000 },
  use: {
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    // Full-suite runs start many Vite dev servers; under parallel local runs
    // the first `page.goto(..., waitUntil: "load")` can exceed 10s even when
    // the app itself is healthy.
    navigationTimeout: 15_000,
    headless: true,
  },
  projects: activeExamples.map((e, i) => {
    const port = ports[i]!
    // The global actionTimeout (10s) already covers the slow "stable" hit-target
    // checks (tab bars, modals, focus rings, layout after view switches) that
    // previously needed a per-example bump.
    return {
      name: e.name,
      use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${port}` },
      testMatch: `${e.name}.spec.ts`,
    }
  }),
  webServer: activeExamples.map((e, i) => {
    const port = ports[i]!
    return {
      command: e.command ? e.command(port) : `npx vite dev --host 127.0.0.1 --port ${port} --strictPort`,
      cwd: e.cwd ?? resolve(EXAMPLES_ROOT, e.dir ?? e.name),
      url: `http://127.0.0.1:${port}`,
      // Reuse a running dev server locally (fast iteration). CI (GitHub Actions) always starts fresh.
      reuseExistingServer: !process.env.GITHUB_ACTIONS,
      timeout: e.timeout ?? 120_000,
      stdout: 'ignore' as const,
      stderr: 'pipe' as const,
    }
  }),
})
