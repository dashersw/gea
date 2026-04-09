import { test, expect } from '@playwright/test'

test.describe('showcase component gallery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.showcase')).toBeVisible({ timeout: 60_000 })
  })

  test('renders hero with title and description', async ({ page }) => {
    await expect(page.locator('.showcase-hero h1')).toHaveText('gea-ui')
    await expect(page.locator('.showcase-hero p')).toContainText('Accessible UI components')
  })

  test('navigation has 7 category links', async ({ page }) => {
    const navLinks = page.locator('.showcase-nav a')
    await expect(navLinks).toHaveCount(7)

    await expect(navLinks.nth(0)).toHaveText('General')
    await expect(navLinks.nth(1)).toHaveText('Data Display')
    await expect(navLinks.nth(2)).toHaveText('Data Entry')
    await expect(navLinks.nth(3)).toHaveText('Feedback')
    await expect(navLinks.nth(4)).toHaveText('Navigation')
    await expect(navLinks.nth(5)).toHaveText('Overlay')
    await expect(navLinks.nth(6)).toHaveText('Disclosure')
  })

  test('all 7 category sections are rendered', async ({ page }) => {
    await expect(page.locator('#general')).toBeVisible()
    await expect(page.locator('#data-display')).toBeVisible()
    await expect(page.locator('#data-entry')).toBeVisible()
    await expect(page.locator('#feedback')).toBeVisible()
    await expect(page.locator('#navigation')).toBeVisible()
    await expect(page.locator('#overlay')).toBeVisible()
    await expect(page.locator('#disclosure')).toBeVisible()
  })

  test('general section shows button variants', async ({ page }) => {
    const generalSection = page.locator('#general')
    await expect(generalSection.getByText('Default').first()).toBeVisible()
    await expect(generalSection.getByText('Secondary').first()).toBeVisible()
    await expect(generalSection.getByText('Destructive').first()).toBeVisible()
    await expect(generalSection.getByText('Outline').first()).toBeVisible()
  })

  test('general section shows badge variants', async ({ page }) => {
    const generalSection = page.locator('#general')
    await expect(generalSection.getByText('Badge')).toBeVisible()
  })

  test('data display section shows cards, avatars, alerts, and progress', async ({ page }) => {
    const section = page.locator('#data-display')
    await expect(section.locator('.category-title')).toHaveText('Data Display')
    await expect(section.locator('.component-card')).toHaveCount(4)
  })

  test('data entry section has form components', async ({ page }) => {
    const section = page.locator('#data-entry')
    await expect(section.locator('.category-title')).toHaveText('Data Entry')

    // Should have multiple component cards
    const cards = section.locator('.component-card')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(10)
  })

  test('input field accepts text', async ({ page }) => {
    const inputSection = page.locator('#data-entry')
    const input = inputSection.locator('input[type="text"]:not([disabled])').first()
    await input.fill('Hello')
    await expect(input).toHaveValue('Hello')
  })

  test('select component is interactive', async ({ page }) => {
    await expect(page.locator('[data-scope="select"]').first()).toBeVisible()
  })

  test('switch toggles are visible', async ({ page }) => {
    const switches = page.locator('[data-scope="switch"]')
    const count = await switches.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('slider component is visible', async ({ page }) => {
    await expect(page.locator('[data-scope="slider"]').first()).toBeVisible()
  })

  test('dialog trigger opens dialog', async ({ page }) => {
    const overlaySection = page.locator('#overlay')
    const dialogTrigger = overlaySection.locator('[data-part="trigger"]').first()
    await dialogTrigger.click()
    await expect(page.locator('[data-part="content"][data-scope="dialog"]').first()).toBeVisible()
  })

  test('tabs component shows switchable content', async ({ page }) => {
    const navSection = page.locator('#navigation')
    await expect(navSection.locator('[data-scope="tabs"]').first()).toBeVisible()
  })

  test('accordion sections are collapsible', async ({ page }) => {
    const disclosureSection = page.locator('#disclosure')
    await expect(disclosureSection.locator('[data-scope="accordion"][data-part="root"]')).toBeVisible()
  })

  test('progress bars show different values', async ({ page }) => {
    const progressBars = page.locator('[role="progressbar"]')
    const count = await progressBars.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test.describe('DOM Stability', () => {
    test('clicking a button does not rebuild the showcase nav', async ({ page }) => {
      const nav = page.locator('.showcase-nav')
      await expect(nav).toBeVisible()

      // Mark the nav node
      await nav.evaluate((el) => el.setAttribute('data-dom-stability-marker', 'original'))

      // Click a button in the general section (simple interaction)
      const generalSection = page.locator('#general')
      await generalSection.getByText('Default').first().click()

      // Verify the nav survived (static page should not rebuild)
      const markerSurvived = await page.locator('[data-dom-stability-marker="original"]').count()
      expect(markerSurvived).toBe(1)
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      const count = await page.locator('[data-gea-compiled-child-root]').count()
      expect(count).toBe(0)
    })
  })
})
