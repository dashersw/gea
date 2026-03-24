import { test, expect } from '@playwright/test'

test.describe('runtime-only todo app', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.todo-app')).toBeVisible()
  })

  test('renders the app with title and input', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Todo')
    await expect(page.locator('.todo-input')).toBeVisible()
    await expect(page.locator('.add-btn')).toBeVisible()
  })

  test('adding a todo via Enter key', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(1)
    await expect(page.locator('.todo-text')).toHaveText('Buy milk')
  })

  test('adding a todo via Add button', async ({ page }) => {
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.add-btn').click()
    await expect(page.locator('.todo-item')).toHaveCount(1)
    await expect(page.locator('.todo-text')).toHaveText('Walk dog')
  })

  test('adding empty text is a no-op', async ({ page }) => {
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(0)

    await page.locator('.todo-input').fill('   ')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(0)
  })

  test('toggling a todo marks it as done', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')

    await page.locator('.todo-item input[type="checkbox"]').click()
    await expect(page.locator('.todo-item.done')).toHaveCount(1)
  })

  test('removing a todo', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(2)

    await page.locator('.remove-btn').first().click()
    await expect(page.locator('.todo-item')).toHaveCount(1)
    await expect(page.locator('.todo-text')).toHaveText('Walk dog')
  })

  test('active count updates correctly', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.active-count')).toHaveText('1 items left')

    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.active-count')).toHaveText('2 items left')

    await page.locator('.todo-item input[type="checkbox"]').first().click()
    await expect(page.locator('.active-count')).toHaveText('1 items left')
  })

  test('footer is hidden when no todos exist', async ({ page }) => {
    await expect(page.locator('.footer')).toHaveClass(/hidden/)

    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.footer')).not.toHaveClass(/hidden/)

    await page.locator('.remove-btn').click()
    await expect(page.locator('.footer')).toHaveClass(/hidden/)
  })

  test('filter: Active hides completed items', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')

    await page.locator('.todo-item input[type="checkbox"]').first().click()

    await page.locator('.filter-btn', { hasText: 'Active' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(1)
    await expect(page.locator('.todo-text')).toHaveText('Walk dog')
    await expect(page.locator('.filter-btn.active')).toHaveText('Active')
  })

  test('filter: Completed shows only completed items', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')

    await page.locator('.todo-item input[type="checkbox"]').first().click()

    await page.locator('.filter-btn', { hasText: 'Completed' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(1)
    await expect(page.locator('.todo-text')).toHaveText('Buy milk')
  })

  test('filter: switching back to All restores full list', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')

    await page.locator('.todo-item input[type="checkbox"]').first().click()

    await page.locator('.filter-btn', { hasText: 'Active' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(1)

    await page.locator('.filter-btn', { hasText: 'All' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(2)
  })

  test('input clears after adding a todo', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-input')).toHaveValue('')
  })

  test('multiple todos can be added and managed', async ({ page }) => {
    const items = ['Buy milk', 'Walk dog', 'Clean house']
    for (const item of items) {
      await page.locator('.todo-input').fill(item)
      await page.locator('.todo-input').press('Enter')
    }
    await expect(page.locator('.todo-item')).toHaveCount(3)

    // Toggle first two
    await page.locator('.todo-item input[type="checkbox"]').nth(0).click()
    await page.locator('.todo-item input[type="checkbox"]').nth(1).click()
    await expect(page.locator('.todo-item.done')).toHaveCount(2)
    await expect(page.locator('.active-count')).toHaveText('1 items left')

    // Remove second item
    await page.locator('.remove-btn').nth(1).click()
    await expect(page.locator('.todo-item')).toHaveCount(2)
  })
})
