import { test, expect } from '@playwright/test'

test.describe('Router Simple (SSR)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.app', { timeout: 500 })
  })

  // --- SSR-specific tests ---

  test('server renders Home page HTML', async ({ page }) => {
    const response = await page.request.get('/')
    const html = await response.text()
    expect(html).toContain('Home')
    // Should contain nav links in SSR HTML
    expect(html).toContain('About')
    expect(html).toContain('Alice')
  })

  test('server renders nav and app shell for /users/1', async ({ page }) => {
    const response = await page.request.get('/users/1')
    const html = await response.text()
    // SSR renders the app shell with navigation links
    expect(html).toContain('Alice')
    expect(html).toContain('class="app"')
  })

  test('server renders app shell for unknown routes', async ({ page }) => {
    const response = await page.request.get('/nonexistent')
    const html = await response.text()
    // SSR renders the app shell
    expect(html).toContain('class="app"')
  })

  test('no console errors after hydration', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('MIME type')) errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForSelector('.app', { timeout: 500 })
    await page.waitForTimeout(1000)
    expect(errors).toEqual([])
  })

  // --- Behavioral tests ---

  test('renders home page with active nav link', async ({ page }) => {
    await expect(page.locator('main h1')).toHaveText('Home')
    await expect(page.locator('.nav-link:has-text("Home")')).toHaveClass(/active/)
  })

  test('navigates to About page', async ({ page }) => {
    await page.click('.nav-link:has-text("About")')
    await expect(page.locator('main h1')).toHaveText('About')
    await expect(page.locator('.nav-link:has-text("About")')).toHaveClass(/active/)
    await expect(page.locator('.nav-link:has-text("Home")')).not.toHaveClass(/active/)
  })

  test('shows Alice user profile', async ({ page }) => {
    await page.click('.nav-link:has-text("Alice")')
    await expect(page.locator('.avatar')).toHaveText('A')
    await expect(page.locator('main h1')).toHaveText('Alice')
    await expect(page.locator('.role')).toHaveText('Engineer')
  })

  test('shows Bob user profile', async ({ page }) => {
    await page.click('.nav-link:has-text("Bob")')
    await expect(page.locator('.avatar')).toHaveText('B')
    await expect(page.locator('main h1')).toHaveText('Bob')
    await expect(page.locator('.role')).toHaveText('Designer')
  })

  test('shows Charlie user profile', async ({ page }) => {
    await page.click('.nav-link:has-text("Charlie")')
    await expect(page.locator('.avatar')).toHaveText('C')
    await expect(page.locator('main h1')).toHaveText('Charlie')
    await expect(page.locator('.role')).toHaveText('PM')
  })

  test('Home link uses exact matching', async ({ page }) => {
    await page.click('.nav-link:has-text("Alice")')
    await expect(page.locator('.nav-link:has-text("Home")')).not.toHaveClass(/active/)
    await expect(page.locator('.nav-link:has-text("Alice")')).toHaveClass(/active/)
  })

  test('shows 404 for unknown routes', async ({ page }) => {
    await page.goto('/nonexistent')
    await expect(page.locator('main h1')).toHaveText('404')
    await expect(page.locator('main')).toContainText('Page not found')
  })

  test('navigates home from 404 page', async ({ page }) => {
    await page.goto('/nonexistent')
    await page.click('.back-link')
    await expect(page.locator('main h1')).toHaveText('Home')
  })

  test('shows user not found for invalid ID via client navigation', async ({ page }) => {
    // Navigate via client-side to avoid Vite dev server path resolution issues
    await page.evaluate(() => window.history.pushState({}, '', '/users/999'))
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent('popstate')))
    await expect(page.locator('main h1')).toHaveText('User not found')
  })

  test('browser back/forward navigation works', async ({ page }) => {
    await page.click('.nav-link:has-text("About")')
    await expect(page.locator('main h1')).toHaveText('About')

    await page.click('.nav-link:has-text("Alice")')
    await expect(page.locator('main h1')).toHaveText('Alice')

    await page.goBack()
    await expect(page.locator('main h1')).toHaveText('About')

    await page.goBack()
    await expect(page.locator('main h1')).toHaveText('Home')

    await page.goForward()
    await expect(page.locator('main h1')).toHaveText('About')
  })

  test('navigation does not cause full page reload', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__spa_marker = true
    })
    await page.click('.nav-link:has-text("About")')
    await expect(page.locator('main h1')).toHaveText('About')
    const marker = await page.evaluate(() => (window as any).__spa_marker)
    expect(marker).toBe(true)
  })
})
