import { defineConfig, devices } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const EXAMPLES_ROOT = resolve(REPO_ROOT, 'examples')

// When E2E_PROJECT is set (CI matrix), only start the matching webServer.
// Locally (unset), all servers start so any --project works.
const targetProject = process.env.E2E_PROJECT || ''

interface ExampleDef {
  name: string
  port: number
  dir?: string // defaults to name
  command?: string // defaults to `npx vite dev --port ${port}`
  cwd?: string // absolute path, defaults to resolve(EXAMPLES_ROOT, dir ?? name)
  timeout?: number // defaults to 120_000
}

const examples: ExampleDef[] = [
  { name: 'todo', port: 5291 },
  { name: 'kanban', port: 5292 },
  { name: 'router-simple', port: 5293 },
  { name: 'router-v2', port: 5294 },
  { name: 'jira-clone', port: 5295, dir: 'jira_clone' },
  { name: 'flight-checkin', port: 5296 },
  { name: 'mobile-showcase', port: 5297 },
  { name: 'saas-dashboard', port: 5298 },
  { name: 'ecommerce', port: 5299 },
  { name: 'chat', port: 5300 },
  { name: 'music-player', port: 5301 },
  { name: 'finance', port: 5302 },
  { name: 'email-client', port: 5303 },
  { name: 'dashboard', port: 5304 },
  { name: 'forms', port: 5305 },
  { name: 'showcase', port: 5306 },
  { name: 'docs', port: 5307 },
  {
    name: 'playground',
    port: 5308,
    command: `python3 -m http.server 5308`,
    cwd: resolve(REPO_ROOT, 'website'),
    timeout: 30_000,
  },
  { name: 'runtime-only', port: 5309 },
  { name: 'runtime-only-jsx', port: 5310 },
]

const activeExamples = targetProject
  ? examples.filter((e) => e.name === targetProject)
  : examples

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    trace: 'on-first-retry',
    actionTimeout: 15000,
    navigationTimeout: 15000,
    headless: true,
  },
  projects: activeExamples.map((e) => ({
    name: e.name,
    use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${e.port}` },
    testMatch: `${e.name}.spec.ts`,
  })),
  webServer: activeExamples.map((e) => ({
    command: e.command ?? `npx vite dev --port ${e.port}`,
    cwd: e.cwd ?? resolve(EXAMPLES_ROOT, e.dir ?? e.name),
    url: `http://localhost:${e.port}`,
    reuseExistingServer: false,
    timeout: e.timeout ?? 120_000,
    stdout: 'ignore' as const,
    stderr: 'pipe' as const,
  })),
})
