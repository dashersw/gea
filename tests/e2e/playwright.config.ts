import { defineConfig, devices } from '@playwright/test'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '../..')
const EXAMPLES_ROOT = resolve(REPO_ROOT, 'examples')

const TODO_PORT = 5291
const KANBAN_PORT = 5292
const ROUTER_SIMPLE_PORT = 5293
const ROUTER_V2_PORT = 5294
const JIRA_CLONE_PORT = 5295
const FLIGHT_CHECKIN_PORT = 5296
const MOBILE_SHOWCASE_PORT = 5297
const SAAS_DASHBOARD_PORT = 5298
const ECOMMERCE_PORT = 5299
const CHAT_PORT = 5300
const MUSIC_PLAYER_PORT = 5301
const FINANCE_PORT = 5302
const EMAIL_CLIENT_PORT = 5303
const DASHBOARD_PORT = 5304
const FORMS_PORT = 5305
const SHOWCASE_PORT = 5306
const DOCS_PORT = 5307
const PLAYGROUND_PORT = 5308
const RUNTIME_ONLY_PORT = 5309
const RUNTIME_ONLY_JSX_PORT = 5310

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
  projects: [
    {
      name: 'todo',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${TODO_PORT}` },
      testMatch: 'todo.spec.ts',
    },
    {
      name: 'kanban',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${KANBAN_PORT}` },
      testMatch: 'kanban.spec.ts',
    },
    {
      name: 'router-simple',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ROUTER_SIMPLE_PORT}` },
      testMatch: 'router-simple.spec.ts',
    },
    {
      name: 'router-v2',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ROUTER_V2_PORT}` },
      testMatch: 'router-v2.spec.ts',
    },
    {
      name: 'jira-clone',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${JIRA_CLONE_PORT}` },
      testMatch: 'jira-clone.spec.ts',
    },
    {
      name: 'flight-checkin',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${FLIGHT_CHECKIN_PORT}` },
      testMatch: 'flight-checkin.spec.ts',
    },
    {
      name: 'mobile-showcase',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${MOBILE_SHOWCASE_PORT}` },
      testMatch: 'mobile-showcase.spec.ts',
    },
    {
      name: 'saas-dashboard',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${SAAS_DASHBOARD_PORT}` },
      testMatch: 'saas-dashboard.spec.ts',
    },
    {
      name: 'ecommerce',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${ECOMMERCE_PORT}` },
      testMatch: 'ecommerce.spec.ts',
    },
    {
      name: 'chat',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${CHAT_PORT}` },
      testMatch: 'chat.spec.ts',
    },
    {
      name: 'music-player',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${MUSIC_PLAYER_PORT}` },
      testMatch: 'music-player.spec.ts',
    },
    {
      name: 'finance',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${FINANCE_PORT}` },
      testMatch: 'finance.spec.ts',
    },
    {
      name: 'email-client',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${EMAIL_CLIENT_PORT}` },
      testMatch: 'email-client.spec.ts',
    },
    {
      name: 'dashboard',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${DASHBOARD_PORT}` },
      testMatch: 'dashboard.spec.ts',
    },
    {
      name: 'forms',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${FORMS_PORT}` },
      testMatch: 'forms.spec.ts',
    },
    {
      name: 'showcase',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${SHOWCASE_PORT}` },
      testMatch: 'showcase.spec.ts',
    },
    {
      name: 'docs',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${DOCS_PORT}` },
      testMatch: 'docs.spec.ts',
    },
    {
      name: 'playground',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PLAYGROUND_PORT}` },
      testMatch: 'playground.spec.ts',
    },
    {
      name: 'runtime-only',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${RUNTIME_ONLY_PORT}` },
      testMatch: 'runtime-only.spec.ts',
    },
    {
      name: 'runtime-only-jsx',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${RUNTIME_ONLY_JSX_PORT}` },
      testMatch: 'runtime-only-jsx.spec.ts',
    },
  ],
  webServer: [
    {
      command: `npx vite dev --port ${TODO_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'todo'),
      url: `http://localhost:${TODO_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${KANBAN_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'kanban'),
      url: `http://localhost:${KANBAN_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${ROUTER_SIMPLE_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'router-simple'),
      url: `http://localhost:${ROUTER_SIMPLE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${ROUTER_V2_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'router-v2'),
      url: `http://localhost:${ROUTER_V2_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${JIRA_CLONE_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'jira_clone'),
      url: `http://localhost:${JIRA_CLONE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${FLIGHT_CHECKIN_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'flight-checkin'),
      url: `http://localhost:${FLIGHT_CHECKIN_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${MOBILE_SHOWCASE_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'mobile-showcase'),
      url: `http://localhost:${MOBILE_SHOWCASE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${SAAS_DASHBOARD_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'saas-dashboard'),
      url: `http://localhost:${SAAS_DASHBOARD_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${ECOMMERCE_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'ecommerce'),
      url: `http://localhost:${ECOMMERCE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${CHAT_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'chat'),
      url: `http://localhost:${CHAT_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${MUSIC_PLAYER_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'music-player'),
      url: `http://localhost:${MUSIC_PLAYER_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${FINANCE_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'finance'),
      url: `http://localhost:${FINANCE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${EMAIL_CLIENT_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'email-client'),
      url: `http://localhost:${EMAIL_CLIENT_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${DASHBOARD_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'dashboard'),
      url: `http://localhost:${DASHBOARD_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${FORMS_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'forms'),
      url: `http://localhost:${FORMS_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${SHOWCASE_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'showcase'),
      url: `http://localhost:${SHOWCASE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${DOCS_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'docs'),
      url: `http://localhost:${DOCS_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `python3 -m http.server ${PLAYGROUND_PORT}`,
      cwd: resolve(REPO_ROOT, 'website'),
      url: `http://localhost:${PLAYGROUND_PORT}`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${RUNTIME_ONLY_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'runtime-only'),
      url: `http://localhost:${RUNTIME_ONLY_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite dev --port ${RUNTIME_ONLY_JSX_PORT}`,
      cwd: resolve(EXAMPLES_ROOT, 'runtime-only-jsx'),
      url: `http://localhost:${RUNTIME_ONLY_JSX_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
