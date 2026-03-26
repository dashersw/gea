import { test, expect } from '@playwright/test'

test.describe('Kanban Board (SSR)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('.kanban-app', { timeout: 15000 })
  })

  // --- SSR-specific tests ---

  test('server renders HTML with board columns and tasks', async ({ page }) => {
    const response = await page.request.get('/')
    const html = await response.text()
    expect(html).toContain('Backlog')
    expect(html).toContain('To Do')
    expect(html).toContain('In Progress')
    expect(html).toContain('Done')
    expect(html).toContain('Design auth flow')
  })

  test('no console errors after hydration', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('MIME type')) errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForSelector('.kanban-app', { timeout: 15000 })
    await page.waitForTimeout(1000)
    expect(errors).toEqual([])
  })

  // --- Behavioral tests ---

  test('renders 4 columns with correct task counts', async ({ page }) => {
    const columns = page.locator('.kanban-column')
    await expect(columns).toHaveCount(4)
    await expect(columns.nth(0).locator('.kanban-card')).toHaveCount(3)
    await expect(columns.nth(1).locator('.kanban-card')).toHaveCount(3)
    await expect(columns.nth(2).locator('.kanban-card')).toHaveCount(2)
    await expect(columns.nth(3).locator('.kanban-card')).toHaveCount(0)
  })

  test('opens task modal on card click', async ({ page }) => {
    await page.locator('.kanban-card').first().click()
    await expect(page.locator('.kanban-modal')).toBeVisible()
    await expect(page.locator('.kanban-modal-title')).toBeVisible()
  })

  test('closes modal via close button', async ({ page }) => {
    await page.locator('.kanban-card').first().click()
    await expect(page.locator('.kanban-modal')).toBeVisible()
    await page.locator('.kanban-modal-close').click()
    await expect(page.locator('.kanban-modal')).not.toBeVisible()
  })

  test('closes modal via Close button in footer', async ({ page }) => {
    await page.locator('.kanban-card').first().click()
    await expect(page.locator('.kanban-modal')).toBeVisible()
    await page.locator('.kanban-btn-ghost:has-text("Close")').click()
    await expect(page.locator('.kanban-modal')).not.toBeVisible()
  })

  test('deletes task from modal', async ({ page }) => {
    const initialCount = await page.locator('.kanban-card').count()
    await page.locator('.kanban-card').first().click()
    await page.locator('.kanban-btn-danger').click()
    await expect(page.locator('.kanban-modal')).not.toBeVisible()
    await expect(page.locator('.kanban-card')).toHaveCount(initialCount - 1)
  })

  test('adds task via Add button', async ({ page }) => {
    const firstColumn = page.locator('.kanban-column').first()
    const initialCount = await firstColumn.locator('.kanban-card').count()
    await firstColumn.locator('.kanban-add-task').click()
    await firstColumn.locator('input[placeholder="Task title"]').fill('New task')
    await firstColumn.locator('.kanban-btn-primary').click()
    await expect(firstColumn.locator('.kanban-card')).toHaveCount(initialCount + 1)
  })

  test('adds task via Enter key', async ({ page }) => {
    const firstColumn = page.locator('.kanban-column').first()
    const initialCount = await firstColumn.locator('.kanban-card').count()
    await firstColumn.locator('.kanban-add-task').click()
    await firstColumn.locator('input[placeholder="Task title"]').fill('Enter task')
    await firstColumn.locator('input[placeholder="Task title"]').press('Enter')
    await expect(firstColumn.locator('.kanban-card')).toHaveCount(initialCount + 1)
  })

  test('cancels add task via Escape', async ({ page }) => {
    const firstColumn = page.locator('.kanban-column').first()
    await firstColumn.locator('.kanban-add-task').click()
    await firstColumn.locator('input[placeholder="Task title"]').press('Escape')
    await expect(firstColumn.locator('.kanban-add-form')).not.toBeVisible()
  })

  test('does not add task with empty title', async ({ page }) => {
    const firstColumn = page.locator('.kanban-column').first()
    const initialCount = await firstColumn.locator('.kanban-card').count()
    await firstColumn.locator('.kanban-add-task').click()
    await firstColumn.locator('.kanban-btn-primary').click()
    await expect(firstColumn.locator('.kanban-card')).toHaveCount(initialCount)
  })

  test('drags task to another column', async ({ page }) => {
    const sourceColumn = page.locator('.kanban-column').nth(0)
    const targetColumn = page.locator('.kanban-column').nth(3)

    const sourceInitial = await sourceColumn.locator('.kanban-card').count()
    const targetInitial = await targetColumn.locator('.kanban-card').count()

    const card = sourceColumn.locator('.kanban-card').first()
    const targetBody = targetColumn.locator('.kanban-column-body')

    await card.dragTo(targetBody)

    await expect(sourceColumn.locator('.kanban-card')).toHaveCount(sourceInitial - 1)
    await expect(targetColumn.locator('.kanban-card')).toHaveCount(targetInitial + 1)
  })
})
