import { test, expect } from '@playwright/test'

test.describe('Advanced SSR Features', () => {

  // --- Head Management ---

  test.describe('Head Management', () => {
    test('onBeforeRender sets document title via SSR', async ({ page }) => {
      const response = await page.request.get('/head')
      const html = await response.text()
      expect(html).toContain('<title>Dynamic SSR Title</title>')
    })

    test('meta description injected into head', async ({ page }) => {
      const response = await page.request.get('/head')
      const html = await response.text()
      expect(html).toContain('<meta name="description" content="Server-rendered meta description">')
    })

    test('og:title meta tag injected into head', async ({ page }) => {
      const response = await page.request.get('/head')
      const html = await response.text()
      expect(html).toContain('<meta property="og:title" content="OG Title from SSR">')
    })

    test('canonical link tag injected into head', async ({ page }) => {
      const response = await page.request.get('/head')
      const html = await response.text()
      expect(html).toContain('<link rel="canonical" href="https://example.com/head">')
    })

    test('head tags appear before </head>', async ({ page }) => {
      const response = await page.request.get('/head')
      const html = await response.text()
      const headEnd = html.indexOf('</head>')
      const titlePos = html.indexOf('<title>Dynamic SSR Title</title>')
      expect(titlePos).toBeGreaterThan(-1)
      expect(titlePos).toBeLessThan(headEnd)
    })

    test('hydrated page reflects SSR title in document.title', async ({ page }) => {
      await page.goto('/head')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('.head-page', { timeout: 15000 })
      // Browser picks the last <title> tag — the SSR-injected one
      await expect(page).toHaveTitle('Dynamic SSR Title')
    })
  })

  // --- Streaming SSR ---

  test.describe('Streaming SSR', () => {
    test('server response contains __GEA_STATE__ with store data', async ({ page }) => {
      const response = await page.request.get('/')
      const html = await response.text()
      expect(html).toContain('window.__GEA_STATE__=')
      expect(html).toContain('AdvancedStore')
      expect(html).toContain('greeting')
    })

    test('response is valid HTML with doctype and closing tags', async ({ page }) => {
      const response = await page.request.get('/')
      const html = await response.text()
      expect(html).toMatch(/^<!DOCTYPE html>/i)
      expect(html).toContain('</html>')
      expect(html).toContain('</body>')
    })

    test('app content is rendered in server HTML', async ({ page }) => {
      const response = await page.request.get('/')
      const html = await response.text()
      expect(html).toContain('Server rendered content')
      expect(html).toContain('Hello from SSR')
    })

    test('hydration restores store state from __GEA_STATE__', async ({ page }) => {
      await page.goto('/')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForSelector('.home-page', { timeout: 15000 })
      const greeting = await page.locator('.home-page h1').textContent()
      expect(greeting).toBe('Hello from SSR')
    })

    test('no console errors after hydration on /', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !msg.text().includes('MIME type')) errors.push(msg.text())
      })
      await page.goto('/')
      await page.waitForSelector('.home-page', { timeout: 15000 })
      await page.waitForTimeout(1000)
      expect(errors).toEqual([])
    })
  })

  // --- Error Boundaries ---

  test.describe('Error Boundaries', () => {
    test('render error returns 200 with onRenderError fallback HTML', async ({ page }) => {
      const response = await page.request.get('/error-render')
      expect(response.status()).toBe(200)
      const html = await response.text()
      expect(html).toContain('Render Error')
      expect(html).toContain('Render explosion')
    })

    test('render error fallback has correct CSS class', async ({ page }) => {
      const response = await page.request.get('/error-render')
      const html = await response.text()
      expect(html).toContain('class="render-error"')
    })

    test('data error returns 500 with onError response', async ({ page }) => {
      const response = await page.request.get('/error-data')
      expect(response.status()).toBe(500)
      const html = await response.text()
      expect(html).toContain('Data Error')
      expect(html).toContain('Data loading failed')
    })

    test('data error includes deterministic digest', async ({ page }) => {
      const response1 = await page.request.get('/error-data')
      const html1 = await response1.text()
      const digest1 = html1.match(/class="error-digest">(gea-[0-9a-z]+)</)?.[1]
      expect(digest1).toBeTruthy()
      expect(digest1).toMatch(/^gea-[0-9a-z]+$/)

      // Same error produces same digest
      const response2 = await page.request.get('/error-data')
      const html2 = await response2.text()
      const digest2 = html2.match(/class="error-digest">(gea-[0-9a-z]+)</)?.[1]
      expect(digest2).toBe(digest1)
    })
  })

  // --- After-Response Hook ---

  test.describe('After-Response Hook', () => {
    test('afterResponse fires after successful render', async ({ page }) => {
      await page.goto('/')
      await page.waitForSelector('.home-page', { timeout: 15000 })
      await page.waitForTimeout(500)

      const debug = await page.request.get('/_debug/last-hook')
      const data = await debug.json()
      expect(data.route).toBe('/')
    })

    test('afterResponse receives correct route for /head', async ({ page }) => {
      await page.goto('/head')
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      const debug = await page.request.get('/_debug/last-hook')
      const data = await debug.json()
      expect(data.route).toBe('/head')
    })

    test('afterResponse does NOT fire on error response', async ({ page }) => {
      // Set side-channel via successful request
      await page.request.get('/head')
      await page.waitForTimeout(500)

      const before = await page.request.get('/_debug/last-hook')
      const dataBefore = await before.json()
      expect(dataBefore.route).toBe('/head')

      // Trigger data error — afterResponse should NOT fire
      await page.request.get('/error-data')
      await page.waitForTimeout(500)

      // Side-channel should still show /head, not /error-data
      const after = await page.request.get('/_debug/last-hook')
      const dataAfter = await after.json()
      expect(dataAfter.route).toBe('/head')
    })
  })

  // --- Deferred Streaming ---

  test.describe('Deferred Streaming', () => {
    test('deferred page contains page structure', async ({ page }) => {
      const response = await page.request.get('/deferred')
      const html = await response.text()
      expect(html).toContain('Deferred Streaming Demo')
    })

    test('fast deferred resolves with replacement script', async ({ page }) => {
      const response = await page.request.get('/deferred')
      const html = await response.text()
      expect(html).toContain('Fast data loaded!')
      expect(html).toContain('document.getElementById')
    })

    test('slow deferred resolves with replacement script', async ({ page }) => {
      const response = await page.request.get('/deferred')
      const html = await response.text()
      expect(html).toContain('Slow data loaded!')
    })

    test('failed deferred has no replacement script', async ({ page }) => {
      const response = await page.request.get('/deferred')
      const html = await response.text()
      const failScriptPattern = /document\.getElementById\(["']deferred-fail["']\)/
      expect(html).not.toMatch(failScriptPattern)
      expect(html).toContain('Loading failing data...')
    })

    test('browser renders resolved content after script execution', async ({ page }) => {
      await page.goto('/deferred')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.locator('.resolved-fast')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('.resolved-slow')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('.resolved-fast')).toHaveText('Fast data loaded!')
      await expect(page.locator('.resolved-slow')).toHaveText('Slow data loaded!')
    })

    test('failed deferred keeps fallback in browser', async ({ page }) => {
      await page.goto('/deferred')
      await page.waitForLoadState('domcontentloaded')
      await expect(page.locator('.resolved-slow')).toBeVisible({ timeout: 5000 })
      await expect(page.locator('#deferred-fail')).toHaveText('Loading failing data...')
    })
  })

  // --- Hydration Mismatch Detection ---

  test.describe('Hydration Mismatch Detection', () => {
    test('mismatch page produces hydration mismatch console warning with server/client diff', async ({ page }) => {
      const warnings: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'warning' && msg.text().includes('mismatch')) {
          warnings.push(msg.text())
        }
      })
      await page.goto('/mismatch')
      await page.waitForSelector('.mismatch-page', { timeout: 15000 })
      await page.waitForTimeout(3000)
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0]).toContain('Hydration mismatch detected')
      // Server renders "Rendered on server", client renders "Rendered on client"
      expect(warnings[0]).toContain('Rendered on server')
    })

    test('mismatch page server HTML contains "Rendered on server"', async ({ page }) => {
      const response = await page.request.get('/mismatch')
      const html = await response.text()
      expect(html).toContain('Rendered on server')
    })
  })
})
