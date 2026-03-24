import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
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
  },
  projects: [
    {
      name: 'ssr',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:5193',
        headless: true,
      },
    },
  ],
  webServer: [
    {
      command: 'npx vite',
      cwd: '.',
      url: 'http://localhost:5193',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
