import { test, expect } from '@playwright/test'

test.describe('Router v2 (SSR)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('gea-router-user'))
  })

  async function login(page, name = 'TestUser', email = 'test@example.com') {
    await page.goto('/login')
    await page.waitForSelector('.login-card', { timeout: 15000 })
    await page.fill('#login-name', name)
    await page.fill('#login-email', email)
    await page.click('.btn-primary')
    await page.waitForSelector('.app-shell', { timeout: 15000 })
  }

  // --- SSR-specific tests ---

  test('server renders app shell HTML', async ({ page }) => {
    const response = await page.request.get('/login')
    const html = await response.text()
    // SSR renders the app wrapper with serialized state
    expect(html).toContain('__GEA_STATE__')
    expect(html).toContain('id="app"')
  })

  test('no console errors after hydration', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('MIME type')) errors.push(msg.text())
    })
    await page.goto('/login')
    await page.waitForSelector('.login-card', { timeout: 15000 })
    await page.waitForTimeout(1000)
    expect(errors).toEqual([])
  })

  // --- Auth tests ---

  test('redirects unauthenticated users to login', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForSelector('.login-page', { timeout: 15000 })
    await expect(page).toHaveURL(/\/login/)
  })

  test('logs in and shows dashboard', async ({ page }) => {
    await login(page, 'Alice', 'alice@test.com')
    await expect(page.locator('.overview h1')).toHaveText('Dashboard')
    await expect(page.locator('.user-name')).toHaveText('Alice')
  })

  test('logs in with default values when fields empty', async ({ page }) => {
    await page.goto('/login')
    await page.waitForSelector('.login-card', { timeout: 15000 })
    await page.click('.btn-primary')
    await page.waitForSelector('.app-shell', { timeout: 15000 })
    await expect(page.locator('.user-name')).toHaveText('User')
  })

  // --- Dashboard tests ---

  test('dashboard shows welcome and stat cards', async ({ page }) => {
    await login(page, 'Bob')
    await expect(page.locator('.overview')).toContainText('Welcome back, Bob!')
    await expect(page.locator('.stat-card')).toHaveCount(3)
  })

  test('navigates to projects from sidebar', async ({ page }) => {
    await login(page)
    await page.click('.sidebar-link:has-text("Projects")')
    await expect(page.locator('.projects h1')).toHaveText('Projects')
    await expect(page).toHaveURL(/\/dashboard\/projects/)
  })

  test('active links highlight correctly', async ({ page }) => {
    await login(page)
    await expect(page.locator('.nav-link:has-text("Dashboard")')).toHaveClass(/active/)
    await expect(page.locator('.sidebar-link:has-text("Overview")')).toHaveClass(/active/)
  })

  // --- Projects tests ---

  test('projects page lists 3 projects', async ({ page }) => {
    await login(page)
    await page.click('.sidebar-link:has-text("Projects")')
    await expect(page.locator('.project-card')).toHaveCount(3)
    await expect(page.locator('.project-card').first()).toContainText('Website Redesign')
  })

  test('navigates to project detail via client-side nav', async ({ page }) => {
    await login(page)
    await page.click('.sidebar-link:has-text("Projects")')
    await page.waitForSelector('.project-card', { timeout: 15000 })
    await page.locator('.project-card').first().getByText('View').click()
    await expect(page.locator('.project-detail h1')).toHaveText('Website Redesign', { timeout: 15000 })
  })

  test('shows project not found for invalid ID via client nav', async ({ page }) => {
    await login(page)
    // Use client-side navigation to avoid Vite dev server path issues
    await page.evaluate(() => window.history.pushState({}, '', '/dashboard/projects/999'))
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))
    await expect(page.locator('h1')).toContainText('Project not found', { timeout: 10000 })
  })

  test('lazy-loads project edit view via client nav', async ({ page }) => {
    await login(page)
    await page.click('.sidebar-link:has-text("Projects")')
    await page.waitForSelector('.project-card', { timeout: 15000 })
    await page.locator('.project-card').first().getByText('View').click()
    await page.waitForSelector('.project-detail', { timeout: 15000 })
    await page.getByText('Edit Project').click()
    await expect(page.locator('.project-edit h1')).toContainText('Edit Project', { timeout: 15000 })
    await expect(page.locator('.project-edit')).toContainText('lazy-loaded')
  })

  // --- Settings tests ---

  test('navigates to settings billing tab', async ({ page }) => {
    await login(page)
    await page.click('.nav-link:has-text("Settings")')
    await page.waitForSelector('.settings-layout', { timeout: 15000 })
    await page.click('.tab:has-text("Billing")')
    await expect(page.locator('.settings-tab h2')).toHaveText('Billing')
    await expect(page.locator('.billing-card')).toContainText('Free Tier')
  })

  test('settings profile tab shows form', async ({ page }) => {
    await login(page, 'Alice', 'alice@test.com')
    await page.click('.nav-link:has-text("Settings")')
    await page.waitForSelector('.settings-layout', { timeout: 15000 })
    await expect(page.locator('.settings-tab h2')).toHaveText('Profile')
  })

  // --- Redirect tests ---

  test('redirects /old-dashboard to /dashboard', async ({ page }) => {
    await login(page)
    await page.goto('/old-dashboard')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test('redirects / to /dashboard when authenticated', async ({ page }) => {
    await login(page)
    await page.goto('/')
    await expect(page).toHaveURL(/\/dashboard/)
  })

  // --- Logout test ---

  test('logout redirects to login', async ({ page }) => {
    await login(page)
    await page.click('.btn-logout')
    await expect(page).toHaveURL(/\/login/)
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login/)
  })

  // --- Session test ---

  test('session persists across page reload', async ({ page }) => {
    await login(page, 'Persistent')
    await page.reload()
    await page.waitForSelector('.app-shell', { timeout: 15000 })
    await expect(page.locator('.user-name')).toHaveText('Persistent')
  })

  // --- 404 test ---
  test('shows 404 for unknown routes', async ({ page }) => {
    // Navigate to /xyz directly — SSR serves the page with guards skipped
    await page.goto('/xyz')
    await page.waitForSelector('.not-found', { timeout: 15000 })
    await expect(page.locator('.not-found h1')).toHaveText('404')
  })

  // --- Layout test ---

  test('renders nested layouts correctly', async ({ page }) => {
    await login(page)
    await expect(page.locator('.top-bar')).toBeVisible()
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.dashboard-main')).toBeVisible()
  })
})
