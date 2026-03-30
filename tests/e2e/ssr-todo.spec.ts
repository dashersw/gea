import { test, expect } from '@playwright/test'

test.describe('SSR Todo List Hydration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.todo-app', { timeout: 2000 })
  })

  test('server renders 3 todo items', async ({ page }) => {
    const response = await page.request.get('/')
    const html = await response.text()
    expect(html).toContain('Server rendered todo 1')
    expect(html).toContain('Server rendered todo 2')
    expect(html).toContain('Server rendered todo 3')
  })

  test('hydrated app shows exactly 3 todos without duplicates', async ({ page }) => {
    const items = page.locator('.todo-item')
    await expect(items).toHaveCount(3)
  })

  test('toggling a todo updates the checkbox without duplicating items', async ({ page }) => {
    const items = page.locator('.todo-item')
    await expect(items).toHaveCount(3)

    // Toggle the first todo
    await page.locator('.todo-checkbox').first().click()
    // Still exactly 3 items
    await expect(items).toHaveCount(3)
  })

  test('clicking Active filter shows only active items without duplicates', async ({ page }) => {
    const items = page.locator('.todo-item')
    await expect(items).toHaveCount(3)

    // Server pre-populates: todo1 (active), todo2 (done), todo3 (active)
    // Click Active filter
    await page.getByRole('button', { name: 'Active' }).click()

    // Should show exactly 2 active todos (not 2 originals + 2 duplicates)
    await expect(items).toHaveCount(2)
  })

  test('switching All -> Active -> All does not duplicate items', async ({ page }) => {
    const items = page.locator('.todo-item')
    await expect(items).toHaveCount(3)

    await page.getByRole('button', { name: 'Active' }).click()
    await expect(items).toHaveCount(2)

    await page.getByRole('button', { name: 'All' }).click()
    // Must be exactly 3, not 6 (duplicated)
    await expect(items).toHaveCount(3)
  })

  test('removing a todo does not cause duplication', async ({ page }) => {
    const items = page.locator('.todo-item')
    await expect(items).toHaveCount(3)

    await page.locator('.todo-remove').first().click()
    await expect(items).toHaveCount(2)
  })
})
