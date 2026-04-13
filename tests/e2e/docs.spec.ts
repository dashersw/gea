import { test, expect } from '@playwright/test'

test.describe('docs component documentation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.docs-layout')).toBeVisible({ timeout: 500 })
  })

  test('renders sidebar with logo and version', async ({ page }) => {
    await expect(page.locator('.docs-sidebar-logo')).toHaveText('gea-ui')
    await expect(page.locator('.docs-sidebar-version')).toContainText('v0.2.0')
  })

  test('sidebar has categorized navigation links', async ({ page }) => {
    const sidebar = page.locator('.docs-sidebar')
    await expect(sidebar.locator('h4')).toHaveCount(8) // 8 categories

    // Check some navigation links exist
    await expect(sidebar.locator('a[href="#button"]')).toBeVisible()
    await expect(sidebar.locator('a[href="#badge"]')).toBeVisible()
    await expect(sidebar.locator('a[href="#input"]')).toBeVisible()
    await expect(sidebar.locator('a[href="#dialog"]')).toBeVisible()
  })

  test('main content area shows doc pages', async ({ page }) => {
    await expect(page.locator('.docs-main')).toBeVisible()
    // Should have multiple doc-page sections
    const docPages = page.locator('.doc-page')
    const count = await docPages.count()
    expect(count).toBeGreaterThanOrEqual(10)
  })

  test('button doc page has demo and code block', async ({ page }) => {
    const buttonPage = page.locator('#button')
    await expect(buttonPage).toBeVisible()
    await expect(buttonPage.locator('.demo-block').first()).toBeVisible()
    await expect(buttonPage.locator('.demo-preview').first()).toBeVisible()
  })

  test('doc pages have API property tables', async ({ page }) => {
    const propTables = page.locator('.prop-table')
    const count = await propTables.count()
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test('code blocks have syntax highlighting', async ({ page }) => {
    // Prism.js highlight runs inside a rAF after render. Auto-wait for the
    // first token rather than a synchronous `.count()` snapshot.
    const tokens = page.locator('.demo-code .token')
    await expect(tokens.first()).toBeAttached({ timeout: 3000 })
    const count = await tokens.count()
    expect(count).toBeGreaterThan(0)
  })

  test('sidebar link click scrolls to component section', async ({ page }) => {
    // Click on Input link in sidebar
    await page.locator('.docs-sidebar a[href="#input"]').click()

    // Input section should be in viewport
    const isVisible = await page.locator('#input').isVisible()
    expect(isVisible).toBe(true)
  })

  test('demo previews show live component instances', async ({ page }) => {
    // Button demo should have actual buttons
    const buttonDemo = page.locator('#button .demo-preview').first()
    await expect(buttonDemo).toBeVisible()
    const buttons = buttonDemo.locator('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)
  })

  test('input component demo is interactive', async ({ page }) => {
    const inputDemo = page.locator('#input .demo-preview')
    await expect(inputDemo).toBeVisible()
    const input = inputDemo.locator('input').first()
    await input.fill('Hello docs')
    await expect(input).toHaveValue('Hello docs')
  })

  test('dialog demo trigger opens dialog', async ({ page }) => {
    const dialogDemo = page.locator('#dialog .demo-preview')
    await expect(dialogDemo).toBeVisible()
    const trigger = dialogDemo.locator('[data-part="trigger"]')
    await trigger.click()
    await expect(page.locator('[data-scope="dialog"] [data-part="content"]').first()).toBeVisible()
  })

  test.describe('DOM Stability', () => {
    test('clicking a sidebar link does not rebuild other sidebar links', async ({ page }) => {
      const buttonLink = page.locator('.docs-sidebar a[href="#button"]')
      const inputLink = page.locator('.docs-sidebar a[href="#input"]')
      await expect(buttonLink).toBeVisible()
      await expect(inputLink).toBeVisible()

      // Mark the button link node
      await buttonLink.evaluate((el) => {
        ;(el as any).__domStabilityMarker = true
      })

      // Click the input link to scroll to a different section
      await inputLink.click()
      await expect(page.locator('#input')).toBeVisible()

      // Verify the button link's marker survived
      const markerSurvived = await buttonLink.evaluate((el) => {
        return (el as any).__domStabilityMarker === true
      })
      expect(markerSurvived).toBe(true)
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      const count = await page.locator('[data-gea-compiled-child-root]').count()
      expect(count).toBe(0)
    })
  })
})
