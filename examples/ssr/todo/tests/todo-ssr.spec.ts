import { test, expect } from '@playwright/test'

test.describe('Todo App (SSR)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.todo-app', { timeout: 15000 })
  })

  // --- SSR-specific tests ---

  test('server renders HTML with pre-seeded todos', async ({ page }) => {
    // Fetch raw HTML (no JS execution)
    const response = await page.request.get('/')
    const html = await response.text()
    expect(html).toContain('Server rendered todo 1')
    expect(html).toContain('Server rendered todo 2')
    expect(html).toContain('Server rendered todo 3')
  })

  test('no console errors after hydration', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('MIME type')) errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForSelector('.todo-app', { timeout: 15000 })
    // Wait a moment for any delayed errors
    await page.waitForTimeout(1000)
    expect(errors).toEqual([])
  })

  test('hydrated app renders pre-seeded todos correctly', async ({ page }) => {
    // Should show 3 pre-seeded todos
    await expect(page.locator('.todo-item')).toHaveCount(3)
    await expect(page.locator('.todo-text').nth(0)).toHaveText('Server rendered todo 1')
    await expect(page.locator('.todo-text').nth(1)).toHaveText('Server rendered todo 2')
    await expect(page.locator('.todo-text').nth(2)).toHaveText('Server rendered todo 3')
    // Second todo should be completed
    await expect(page.locator('.todo-item').nth(1)).toHaveClass(/done/)
  })

  // --- Behavioral tests (adapted for pre-seeded state) ---

  test('adds a todo via Add button', async ({ page }) => {
    await page.fill('.todo-input', 'Buy milk')
    await page.click('.btn-primary')
    await expect(page.locator('.todo-item')).toHaveCount(4)
    await expect(page.locator('.todo-text').last()).toHaveText('Buy milk')
    await expect(page.locator('.todo-input')).toHaveValue('')
  })

  test('adds a todo via Enter key', async ({ page }) => {
    await page.fill('.todo-input', 'Read book')
    await page.press('.todo-input', 'Enter')
    await expect(page.locator('.todo-item')).toHaveCount(4)
    await expect(page.locator('.todo-input')).toHaveValue('')
  })

  test('does not add empty todo', async ({ page }) => {
    await page.click('.btn-primary')
    await expect(page.locator('.todo-item')).toHaveCount(3)
    await page.fill('.todo-input', '   ')
    await page.click('.btn-primary')
    await expect(page.locator('.todo-item')).toHaveCount(3)
  })

  test('toggles todo complete', async ({ page }) => {
    // First todo is active, toggle it
    await page.locator('.todo-checkbox').first().click()
    await expect(page.locator('.todo-item').first()).toHaveClass(/done/)
  })

  test('toggles todo back to active', async ({ page }) => {
    // Second todo is done, toggle it back
    await page.locator('.todo-checkbox').nth(1).click()
    await expect(page.locator('.todo-item').nth(1)).not.toHaveClass(/done/)
  })

  test('deletes a todo', async ({ page }) => {
    await page.locator('.todo-remove').first().click()
    await expect(page.locator('.todo-item')).toHaveCount(2)
  })

  test('enters edit mode on double-click', async ({ page }) => {
    await page.locator('.todo-text').first().dblclick()
    await expect(page.locator('.todo-item').first()).toHaveClass(/editing/)
    await expect(page.locator('.todo-edit')).toBeVisible()
    await expect(page.locator('.todo-edit')).toHaveValue('Server rendered todo 1')
  })

  test('confirms edit with Enter', async ({ page }) => {
    await page.locator('.todo-text').first().dblclick()
    await page.locator('.todo-edit').fill('Updated text')
    await page.press('.todo-edit', 'Enter')
    await expect(page.locator('.todo-item').first()).not.toHaveClass(/editing/)
    await expect(page.locator('.todo-text').first()).toHaveText('Updated text')
  })

  test('cancels edit with Escape', async ({ page }) => {
    await page.locator('.todo-text').first().dblclick()
    await page.locator('.todo-edit').fill('Changed text')
    await page.press('.todo-edit', 'Escape')
    await expect(page.locator('.todo-text').first()).toHaveText('Server rendered todo 1')
  })

  test('filters: Active shows only uncompleted', async ({ page }) => {
    // Pre-seeded: 2 active, 1 completed
    await page.click('.filter-btn:has-text("Active")')
    await expect(page.locator('.todo-item')).toHaveCount(2)
  })

  test('filters: Completed shows only completed', async ({ page }) => {
    await page.click('.filter-btn:has-text("Completed")')
    await expect(page.locator('.todo-item')).toHaveCount(1)
  })

  test('filters: All shows all todos', async ({ page }) => {
    await page.click('.filter-btn:has-text("Active")')
    await page.click('.filter-btn:has-text("All")')
    await expect(page.locator('.todo-item')).toHaveCount(3)
  })

  test('counters show correct values', async ({ page }) => {
    // Pre-seeded: 2 active, 1 completed
    await expect(page.locator('.todo-count').first()).toContainText('2 items left')
    await expect(page.locator('.todo-count.completed')).toContainText('1 completed')
  })

  test('filter section visible with pre-seeded todos', async ({ page }) => {
    await expect(page.locator('.todo-filters')).toBeVisible()
  })
})
