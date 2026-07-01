import { test, expect } from '@playwright/test'

test.describe('Sheet editor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.sheet-editor', { timeout: 10000 })
  })

  test('typing when a cell is selected enters edit mode and types into the inline input', async ({ page }) => {
    const a1 = page.locator('[data-address="A1"]')
    await a1.click()
    await expect(a1).toBeFocused()
    await page.keyboard.type('q')
    const inline = a1.locator('.sheet-cell-input')
    await expect(inline).toBeVisible()
    await expect(inline).toBeFocused()
    await expect(inline).toHaveValue('q')
  })

  test('Enter after typing in a cell commits the value', async ({ page }) => {
    const a1 = page.locator('[data-address="A1"]')
    await a1.click()
    await expect(a1).toBeFocused()
    await page.keyboard.type('63')
    await page.keyboard.press('Enter')
    await expect(a1.locator('.sheet-cell-value')).toHaveText('63')
    await expect(a1.locator('.sheet-cell-input')).toHaveCount(0)
  })

  test('Enter in formula bar commits the active cell value', async ({ page }) => {
    const a1 = page.locator('[data-address="A1"]')
    await a1.click()
    const bar = page.locator('.formula-bar-input')
    await bar.click()
    await bar.fill('44')
    await bar.press('Enter')
    await expect(a1.locator('.sheet-cell-value')).toHaveText('44')
  })

  test('formula bar and cell display update after commit', async ({ page }) => {
    const bar = page.locator('.formula-bar-input')
    await expect(bar).toBeVisible()
    await bar.fill('42')
    await bar.press('Enter')
    await expect(page.locator('[data-address="A1"] .sheet-cell-value')).toHaveText('42')
  })

  test('dependent formula recalculates when source changes', async ({ page }) => {
    const bar = page.locator('.formula-bar-input')
    await bar.fill('10')
    await bar.press('Enter')

    await page.locator('[data-address="B1"]').click()
    await expect(page.locator('.formula-bar-label')).toContainText('B1')
    await bar.fill('=A1+5')
    await bar.press('Enter')
    await expect(page.locator('[data-address="B1"] .sheet-cell-value')).toHaveText('15')

    await page.locator('[data-address="A1"]').click()
    await bar.fill('20')
    await bar.press('Enter')
    await expect(page.locator('[data-address="B1"] .sheet-cell-value')).toHaveText('25')
  })

  test('arrow keys move selection between cells', async ({ page }) => {
    const a1 = page.locator('[data-address="A1"]')
    await a1.click()
    await expect(a1).toBeFocused()
    await page.keyboard.press('ArrowRight')
    const b1 = page.locator('[data-address="B1"]')
    await expect(b1).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.locator('[data-address="B2"]')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(page.locator('[data-address="A2"]')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(page.locator('[data-address="A1"]')).toBeFocused()
  })

  test('SUM range', async ({ page }) => {
    const bar = page.locator('.formula-bar-input')
    for (const [addr, val] of [
      ['A1', '2'],
      ['A2', '3'],
      ['A3', '4'],
    ] as const) {
      await page.locator(`[data-address="${addr}"]`).click()
      await bar.fill(val)
      await bar.press('Enter')
    }
    await page.locator('[data-address="A4"]').click()
    await bar.fill('=SUM(A1:A3)')
    await bar.press('Enter')
    await expect(page.locator('[data-address="A4"] .sheet-cell-value')).toHaveText('9')
  })

  test.describe('DOM stability', () => {
    test('surgical update preserves dependent cell DOM node when source changes', async ({ page }) => {
      const bar = page.locator('.formula-bar-input')
      await bar.fill('1')
      await bar.press('Enter')
      await page.locator('[data-address="B1"]').click()
      await bar.fill('=A1+99')
      await bar.press('Enter')

      const b1CellIdBefore = await page.locator('[data-address="B1"]').evaluate((el) => el.id)

      await page.locator('[data-address="A1"]').click()
      await bar.fill('10')
      await bar.press('Enter')

      await expect(page.locator('[data-address="B1"] .sheet-cell-value')).toHaveText('109')
      const b1CellIdAfter = await page.locator('[data-address="B1"]').evaluate((el) => el.id)
      expect(b1CellIdAfter).toBe(b1CellIdBefore)
    })

    test('no data-gea-compiled-child-root attributes in DOM', async ({ page }) => {
      const leaked = await page.locator('[data-gea-compiled-child-root]').count()
      expect(leaked).toBe(0)
    })
  })
})
