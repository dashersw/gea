import { test, expect, type Page, type FrameLocator } from '@playwright/test'

// The playground compiles code in-browser — give extra time for iframe init
test.use({ actionTimeout: 20000 })

function preview(page: Page): FrameLocator {
  return page.locator('#playground-preview').contentFrame()
}

/** Collect all console errors from the iframe preview */
async function collectErrors(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  return errors
}

/** Switch to todo example and wait for it to be fully interactive */
async function switchToTodo(page: Page) {
  await page.getByRole('button', { name: 'Todo' }).click()
  await expect(preview(page).locator('.todo-app')).toBeVisible({ timeout: 500 })
  // Wait for event delegation to be fully wired up in the iframe
  await page.waitForTimeout(500)
}

/** Add a todo in the playground preview and wait for it to appear */
async function addTodo(frame: FrameLocator, text: string, expectedCount: number) {
  await frame.getByPlaceholder('What needs to be done?').pressSequentially(text)
  await frame.getByRole('button', { name: 'Add' }).click()
  await expect(frame.locator('.todo-list li')).toHaveCount(expectedCount, { timeout: 500 })
}

test.describe('Website Playground', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for playground to initialise — counter preview iframe should render
    await expect(preview(page).locator('.counter')).toBeVisible({ timeout: 5000 })
  })

  // ── Counter example ──────────────────────────────────────

  test.describe('Counter Example', () => {
    test('renders initial count of 0', async ({ page }) => {
      const frame = preview(page)
      await expect(frame.locator('.counter span')).toHaveText('0')
    })

    test('increment button increases count', async ({ page }) => {
      const frame = preview(page)
      await frame.getByRole('button', { name: '+' }).click()
      await expect(frame.locator('.counter span')).toHaveText('1')
      await frame.getByRole('button', { name: '+' }).click()
      await expect(frame.locator('.counter span')).toHaveText('2')
    })

    test('decrement button decreases count', async ({ page }) => {
      const frame = preview(page)
      await frame.getByRole('button', { name: '+' }).click()
      await frame.getByRole('button', { name: '+' }).click()
      await expect(frame.locator('.counter span')).toHaveText('2')
      await frame.getByRole('button', { name: '-' }).click()
      await expect(frame.locator('.counter span')).toHaveText('1')
    })

    test('no console errors during interaction', async ({ page }) => {
      const errors = await collectErrors(page)
      const frame = preview(page)
      await frame.getByRole('button', { name: '+' }).click()
      await frame.getByRole('button', { name: '-' }).click()
      await page.waitForTimeout(200)
      const relevantErrors = errors.filter((e) => !e.includes('sandbox'))
      expect(relevantErrors).toEqual([])
    })
  })

  // ── Todo example ─────────────────────────────────────────

  test.describe('Todo Example', () => {
    test.beforeEach(async ({ page }) => {
      await switchToTodo(page)
    })

    test('renders empty todo list with counts', async ({ page }) => {
      const frame = preview(page)
      await expect(frame.locator('.todo-list li')).toHaveCount(0)
      await expect(frame.locator('.count')).toHaveText('0 active, 0 completed')
    })

    test('adds a todo item', async ({ page }) => {
      const frame = preview(page)
      await addTodo(frame, 'Buy milk', 1)
      await expect(frame.locator('.todo-list li span')).toHaveText('Buy milk')
      await expect(frame.locator('.count')).toHaveText('1 active, 0 completed')
    })

    test('adds multiple todos', async ({ page }) => {
      const frame = preview(page)
      await addTodo(frame, 'Task 1', 1)
      await addTodo(frame, 'Task 2', 2)
      await expect(frame.locator('.count')).toHaveText('2 active, 0 completed')
    })

    test('toggles a todo done', async ({ page }) => {
      const frame = preview(page)
      await addTodo(frame, 'Walk dog', 1)
      await frame.locator('.todo-list li input[type="checkbox"]').click()
      await expect(frame.locator('.count')).toHaveText('0 active, 1 completed')
      await expect(frame.locator('.todo-list li')).toHaveClass(/done/)
    })

    test('removes a todo', async ({ page }) => {
      const frame = preview(page)
      await addTodo(frame, 'Temp', 1)
      await frame.locator('.todo-list li .remove').click()
      await expect(frame.locator('.todo-list li')).toHaveCount(0)
      await expect(frame.locator('.count')).toHaveText('0 active, 0 completed')
    })

    test('clears input after adding', async ({ page }) => {
      const frame = preview(page)
      await addTodo(frame, 'Hello', 1)
      await expect(frame.getByPlaceholder('What needs to be done?')).toHaveValue('')
    })

    test('no console errors when adding todos', async ({ page }) => {
      const errors = await collectErrors(page)
      const frame = preview(page)
      await addTodo(frame, 'Test', 1)
      await page.waitForTimeout(300)
      const relevantErrors = errors.filter((e) => !e.includes('sandbox'))
      expect(relevantErrors).toEqual([])
    })
  })

  // ── Switching examples ───────────────────────────────────

  test.describe('Example Switching', () => {
    test('switching from counter to todo loads todo app', async ({ page }) => {
      await switchToTodo(page)
      await expect(preview(page).locator('.counter')).not.toBeVisible()
    })

    test('switching from todo back to counter loads counter', async ({ page }) => {
      await switchToTodo(page)
      await page.getByRole('button', { name: 'Counter' }).click()
      await expect(preview(page).locator('.counter')).toBeVisible({ timeout: 2000 })
      await expect(preview(page).locator('.todo-app')).not.toBeVisible()
    })
  })

  // ── Rendering quality ────────────────────────────────────

  test.describe('Rendering Quality', () => {
    test('counter: no [object Object] in rendered HTML', async ({ page }) => {
      const html = await preview(page).locator('body').innerHTML()
      expect(html).not.toContain('[object Object]')
    })

    test('counter: no undefined in element IDs', async ({ page }) => {
      const ids = await preview(page)
        .locator('[id]')
        .evaluateAll((els) => els.map((el) => el.id))
      for (const id of ids) {
        expect(id).not.toContain('undefined')
        expect(id).not.toContain('null')
      }
    })

    test('counter: no style="[object Object]"', async ({ page }) => {
      const badStyles = await preview(page).locator('[style*="[object"]').count()
      expect(badStyles).toBe(0)
    })

    test('todo: no [object Object] in rendered HTML', async ({ page }) => {
      await switchToTodo(page)

      const frame = preview(page)
      await addTodo(frame, 'Check rendering', 1)

      const html = await frame.locator('body').innerHTML()
      expect(html).not.toContain('[object Object]')
    })

    test('todo: no undefined in element IDs', async ({ page }) => {
      await switchToTodo(page)

      const frame = preview(page)
      await addTodo(frame, 'ID check', 1)

      const ids = await frame.locator('[id]').evaluateAll((els) => els.map((el) => el.id))
      for (const id of ids) {
        expect(id).not.toContain('undefined')
        expect(id).not.toContain('null')
      }
    })

    test('todo: no style="[object Object]"', async ({ page }) => {
      await switchToTodo(page)

      const frame = preview(page)
      await addTodo(frame, 'Style check', 1)

      const badStyles = await frame.locator('[style*="[object"]').count()
      expect(badStyles).toBe(0)
    })

    test('todo: dynamic class binding works on toggled items', async ({ page }) => {
      await switchToTodo(page)

      const frame = preview(page)
      await addTodo(frame, 'Class test', 1)

      // Before toggle — no 'done' class
      const classBefore = await frame.locator('.todo-list li').getAttribute('class')
      expect(classBefore).not.toContain('done')

      // Toggle it
      await frame.locator('.todo-list li input[type="checkbox"]').click()
      const classAfter = await frame.locator('.todo-list li').getAttribute('class')
      expect(classAfter).toContain('done')
    })
  })

  // ── Editor tabs ──────────────────────────────────────────

  test.describe('Editor', () => {
    test('counter: shows source file tabs', async ({ page }) => {
      await expect(page.getByRole('button', { name: /store\.ts/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /Counter\.tsx/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /^app\.tsx$/ })).toBeVisible()
    })

    test('todo: shows all source file tabs', async ({ page }) => {
      await page.getByRole('button', { name: 'Todo' }).click()
      await expect(page.getByRole('button', { name: /todo-store\.ts/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /TodoApp\.tsx/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /TodoInput\.tsx/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /TodoItem\.tsx/ })).toBeVisible()
    })
  })
})
