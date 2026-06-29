import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Single source of truth for the E2E example projects. Imported by both
// playwright.config.ts (to build projects + webServers) and run-e2e.mjs (the
// batch runner). Keeping one list avoids the two drifting out of sync.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * @typedef {Object} ExampleDef
 * @property {string} name
 * @property {string} [dir]                       defaults to name
 * @property {(port: number) => string} [command] defaults to vite dev with dynamic port
 * @property {string} [cwd]                        absolute; defaults to resolve(EXAMPLES_ROOT, dir ?? name)
 * @property {number} [timeout]                    webServer ready wait; defaults to 120_000 (Vite cold start)
 */

/** @type {ExampleDef[]} */
export const examples = [
  { name: 'todo' },
  { name: 'kanban' },
  { name: 'router-simple' },
  { name: 'router-v2' },
  { name: 'jira-clone', dir: 'jira_clone' },
  { name: 'flight-checkin' },
  { name: 'mobile-showcase' },
  { name: 'saas-dashboard' },
  { name: 'ecommerce' },
  { name: 'chat' },
  { name: 'music-player' },
  { name: 'finance' },
  { name: 'email-client' },
  { name: 'dashboard' },
  { name: 'forms' },
  { name: 'showcase' },
  { name: 'docs' },
  { name: 'playground', cwd: resolve(REPO_ROOT, 'website') },
  { name: 'runtime-only' },
  { name: 'runtime-only-jsx' },
  { name: 'ssr-router-simple', dir: 'ssr/router-simple' },
  { name: 'sheet-editor' },
]

/** Ordered example names — what the batch runner chunks over. */
export const exampleNames = examples.map((e) => e.name)
