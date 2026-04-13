import { test, expect } from '@playwright/test'

test.describe('kanban surgical DOM updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.kanban-app')).toBeVisible()
    // Wait for columns to render
    await expect(page.locator('.kanban-column').first()).toBeVisible()
  })

  test('initial render must produce exactly 4 columns (no spurious re-render doubling)', async ({ page }) => {
    // The store has 4 columns. If __geaRequestRender fires spuriously during
    // store initialization, the columns map gets appended again, yielding 8.
    await expect(page.locator('.kanban-column')).toHaveCount(4)
  })

  test('initial render shows correct card counts per column', async ({ page }) => {
    // Backlog: t1, t6, t8 = 3 cards
    // To Do: t2, t4, t7 = 3 cards
    // In Progress: t3, t5 = 2 cards
    // Done: 0 cards
    await expect(page.locator('.kanban-card')).toHaveCount(8)

    const columns = page.locator('.kanban-column')
    await expect(columns.nth(0).locator('.kanban-card')).toHaveCount(3)
    await expect(columns.nth(1).locator('.kanban-card')).toHaveCount(3)
    await expect(columns.nth(2).locator('.kanban-card')).toHaveCount(2)
    await expect(columns.nth(3).locator('.kanban-card')).toHaveCount(0)
  })

  test('adding a task must not create spurious columns', async ({ page }) => {
    await expect(page.locator('.kanban-column')).toHaveCount(4)

    const backlogColumn = page.locator('.kanban-column').first()
    await backlogColumn.locator('.kanban-add-task').click()
    await backlogColumn.locator('input[type="text"]').fill('Spurious column check')
    await backlogColumn.locator('input[type="text"]').press('Enter')

    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(4)
    await expect(page.locator('.kanban-column')).toHaveCount(4)
  })

  test('adding a task must not detach/reattach existing cards in the column', async ({ page }) => {
    const backlogColumn = page.locator('.kanban-column').first()
    const backlogBody = backlogColumn.locator('.kanban-column-body')

    // Install MutationObserver on the column body to track card removals
    await backlogBody.evaluate((el) => {
      ;(window as any).__removedNodes = []
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.removedNodes)) {
            if (node.nodeType === 1 && (node as HTMLElement).classList.contains('kanban-card')) {
              ;(window as any).__removedNodes.push((node as HTMLElement).outerHTML.slice(0, 80))
            }
          }
        }
      })
      observer.observe(el, { childList: true })
      ;(window as any).__mutationObserver = observer
    })

    // Click "+ Add task" in the backlog column
    await backlogColumn.locator('.kanban-add-task').click()

    // Fill in the task title and submit
    await backlogColumn.locator('input[type="text"]').fill('New regression task')
    await backlogColumn.locator('input[type="text"]').press('Enter')

    // Should now have 4 cards in backlog
    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(4)

    // No existing card nodes should have been removed
    const removedNodes = await page.evaluate(() => (window as any).__removedNodes)
    expect(removedNodes).toEqual([])

    await page.evaluate(() => (window as any).__mutationObserver?.disconnect())
  })

  test('adding a task must not detach/reattach cards in other columns', async ({ page }) => {
    // Mark a card in the second column (To Do)
    const todoColumn = page.locator('.kanban-column').nth(1)
    await todoColumn
      .locator('.kanban-card')
      .first()
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'todo-first')
      })

    // Mark a card in the third column (In Progress)
    const progressColumn = page.locator('.kanban-column').nth(2)
    await progressColumn
      .locator('.kanban-card')
      .first()
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'progress-first')
      })

    // Add a task to backlog
    const backlogColumn = page.locator('.kanban-column').first()
    await backlogColumn.locator('.kanban-add-task').click()
    await backlogColumn.locator('input[type="text"]').fill('Another task')
    await backlogColumn.locator('input[type="text"]').press('Enter')
    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(4)

    // Cards in other columns must still have their markers (same DOM nodes)
    const todoMarker = await todoColumn
      .locator('.kanban-card')
      .first()
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    const progressMarker = await progressColumn
      .locator('.kanban-card')
      .first()
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    expect(todoMarker).toBe('todo-first')
    expect(progressMarker).toBe('progress-first')
  })

  test('opening and closing task modal must not rebuild column cards', async ({ page }) => {
    const backlogColumn = page.locator('.kanban-column').first()

    // Mark first card in backlog
    await backlogColumn
      .locator('.kanban-card')
      .first()
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'backlog-first')
      })

    // Click a card to open the modal
    await backlogColumn.locator('.kanban-card').first().click()
    await expect(page.locator('.kanban-modal-backdrop')).toBeVisible()

    // Close the modal
    await page.locator('.kanban-modal-close').click()
    await expect(page.locator('.kanban-modal-backdrop')).not.toBeVisible()

    // Card must still have its marker
    const marker = await backlogColumn
      .locator('.kanban-card')
      .first()
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    expect(marker).toBe('backlog-first')
  })

  test('delete task via modal removes the card and closes the modal', async ({ page }) => {
    const backlogColumn = page.locator('.kanban-column').first()
    const countBefore = await backlogColumn.locator('.kanban-card').count()

    // Click first card to open modal
    const cardTitle = await backlogColumn.locator('.kanban-card-title').first().textContent()
    await backlogColumn.locator('.kanban-card').first().click()
    await expect(page.locator('.kanban-modal-backdrop')).toBeVisible()

    // Click Delete button
    await page.locator('.kanban-btn-danger').click()

    // Modal should close
    await expect(page.locator('.kanban-modal-backdrop')).not.toBeVisible()

    // Card count should decrease by 1
    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(countBefore - 1)

    // The deleted card's title should no longer appear in the column
    const remainingTitles = await backlogColumn.locator('.kanban-card-title').allTextContents()
    expect(remainingTitles).not.toContain(cardTitle)
  })

  test('deleting a task must not detach surviving cards', async ({ page }) => {
    const backlogColumn = page.locator('.kanban-column').first()

    // Install MutationObserver to track card removals
    await backlogColumn.locator('.kanban-column-body').evaluate((el) => {
      ;(window as any).__removedCards = []
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.removedNodes)) {
            if (node.nodeType === 1 && (node as HTMLElement).classList.contains('kanban-card')) {
              ;(window as any).__removedCards.push((node as HTMLElement).textContent?.trim().slice(0, 40))
            }
          }
        }
      })
      observer.observe(el, { childList: true })
      ;(window as any).__deleteObserver = observer
    })

    const countBefore = await backlogColumn.locator('.kanban-card').count()
    expect(countBefore).toBeGreaterThanOrEqual(2)

    // Delete the first card via modal
    await backlogColumn.locator('.kanban-card').first().click()
    await expect(page.locator('.kanban-modal-backdrop')).toBeVisible()
    await page.locator('.kanban-btn-danger').click()
    await expect(page.locator('.kanban-modal-backdrop')).not.toBeVisible()

    // Only 1 card should have been removed (the deleted one)
    const removedCards = await page.evaluate(() => (window as any).__removedCards)
    expect(removedCards).toHaveLength(1)

    await page.evaluate(() => (window as any).__deleteObserver?.disconnect())
  })

  test('cancel adding via Cancel button hides form and restores "+ Add task"', async ({ page }) => {
    const backlogColumn = page.locator('.kanban-column').first()
    const countBefore = await backlogColumn.locator('.kanban-card').count()

    // Open add form
    await backlogColumn.locator('.kanban-add-task').click()
    await expect(backlogColumn.locator('input[type="text"]')).toBeVisible()
    await expect(backlogColumn.locator('.kanban-add-task')).not.toBeVisible()

    // Type something then cancel
    await backlogColumn.locator('input[type="text"]').fill('Will be cancelled')
    await backlogColumn.locator('.kanban-btn-ghost').click()

    // Form should disappear, "+ Add task" should return
    await expect(backlogColumn.locator('input[type="text"]')).not.toBeVisible()
    await expect(backlogColumn.locator('.kanban-add-task')).toBeVisible()

    // No new card should be created
    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(countBefore)
  })

  test('cancel adding via Escape key hides form and restores "+ Add task"', async ({ page }) => {
    const backlogColumn = page.locator('.kanban-column').first()
    const countBefore = await backlogColumn.locator('.kanban-card').count()

    // Open add form
    await backlogColumn.locator('.kanban-add-task').click()
    await expect(backlogColumn.locator('input[type="text"]')).toBeVisible()

    // Type something then press Escape
    await backlogColumn.locator('input[type="text"]').fill('Will be escaped')
    await backlogColumn.locator('input[type="text"]').press('Escape')

    // Form should disappear, "+ Add task" should return
    await expect(backlogColumn.locator('input[type="text"]')).not.toBeVisible()
    await expect(backlogColumn.locator('.kanban-add-task')).toBeVisible()

    // No new card should be created
    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(countBefore)
  })

  test('modal shows correct task content (title, description, priority, assignee)', async ({ page }) => {
    // Click the first card in "To Do" column (t2: "API rate limiting")
    const todoColumn = page.locator('.kanban-column').nth(1)
    await todoColumn.locator('.kanban-card').first().click()
    await expect(page.locator('.kanban-modal-backdrop')).toBeVisible()

    // Verify title
    await expect(page.locator('.kanban-modal-title')).toHaveText('API rate limiting')

    // Verify description
    await expect(page.locator('.kanban-modal-value').first()).toHaveText(
      'Implement rate limiting middleware for public endpoints.',
    )

    // Verify priority
    await expect(page.locator('.kanban-modal-value').nth(1)).toHaveText('medium')

    // Verify assignee
    await expect(page.locator('.kanban-modal-value').nth(2)).toHaveText('Sam')

    await page.locator('.kanban-modal-close').click()
  })

  test('modal shows "No description" for tasks without description', async ({ page }) => {
    // Add a task to backlog (new tasks get empty description by default)
    const backlogColumn = page.locator('.kanban-column').first()
    const countBefore = await backlogColumn.locator('.kanban-card').count()

    await backlogColumn.locator('.kanban-add-task').click()
    await backlogColumn.locator('input[type="text"]').fill('No desc task')
    await backlogColumn.locator('input[type="text"]').press('Enter')
    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(countBefore + 1)

    // Click the newly added card (last one)
    await backlogColumn.locator('.kanban-card').last().click()
    await expect(page.locator('.kanban-modal-backdrop')).toBeVisible()

    // Should show "No description" with empty class
    await expect(page.locator('.kanban-modal-value.empty')).toBeVisible()
    await expect(page.locator('.kanban-modal-value.empty')).toHaveText('No description')

    await page.locator('.kanban-modal-close').click()
  })

  test('add task via "Add" button (not Enter)', async ({ page }) => {
    const todoColumn = page.locator('.kanban-column').nth(1)
    const countBefore = await todoColumn.locator('.kanban-card').count()

    // Open add form
    await todoColumn.locator('.kanban-add-task').click()
    await todoColumn.locator('input[type="text"]').fill('Added via button')

    // Click the Add button
    await todoColumn.locator('.kanban-btn-primary').click()

    // Should have one more card
    await expect(todoColumn.locator('.kanban-card')).toHaveCount(countBefore + 1)

    // The new card should have the correct title
    const lastCard = todoColumn.locator('.kanban-card-title').last()
    await expect(lastCard).toHaveText('Added via button')
  })

  test('add task to In Progress column', async ({ page }) => {
    const progressColumn = page.locator('.kanban-column').nth(2)
    const countBefore = await progressColumn.locator('.kanban-card').count()

    await progressColumn.locator('.kanban-add-task').click()
    await progressColumn.locator('input[type="text"]').fill('Progress task')
    await progressColumn.locator('input[type="text"]').press('Enter')

    await expect(progressColumn.locator('.kanban-card')).toHaveCount(countBefore + 1)
    await expect(progressColumn.locator('.kanban-card-title').last()).toHaveText('Progress task')
  })

  test('empty title does not create a task', async ({ page }) => {
    const backlogColumn = page.locator('.kanban-column').first()
    const countBefore = await backlogColumn.locator('.kanban-card').count()

    // Open add form and submit empty
    await backlogColumn.locator('.kanban-add-task').click()
    await backlogColumn.locator('input[type="text"]').press('Enter')

    // Card count should not change
    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(countBefore)

    // Try with whitespace-only
    await backlogColumn.locator('input[type="text"]').fill('   ')
    await backlogColumn.locator('.kanban-btn-primary').click()

    await expect(backlogColumn.locator('.kanban-card')).toHaveCount(countBefore)
  })

  test.describe('Drag and drop', () => {
    async function simulateDrop(page: any, taskId: string, fromColumnId: string, targetColumnIndex: number) {
      await page.evaluate(
        ({ taskId, fromColumnId, targetColIdx }: any) => {
          const targetCol = document.querySelectorAll('.kanban-column')[targetColIdx] as HTMLElement
          if (!targetCol) throw new Error('Target column not found')
          const dt = new DataTransfer()
          dt.setData('application/json', JSON.stringify({ taskId, fromColumnId }))
          const evt = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
          targetCol.dispatchEvent(evt)
        },
        { taskId, fromColumnId, targetColIdx: targetColumnIndex },
      )
    }

    test('drag a card from one column to another', async ({ page }) => {
      const sourceColumn = page.locator('.kanban-column').nth(0) // Backlog
      const targetColumn = page.locator('.kanban-column').nth(3) // Done

      const sourceInitial = await sourceColumn.locator('.kanban-card').count()
      const targetInitial = await targetColumn.locator('.kanban-card').count()

      const cardTitle = await sourceColumn.locator('.kanban-card-title').first().textContent()

      await simulateDrop(page, 't1', 'col-backlog', 3)

      await expect(sourceColumn.locator('.kanban-card')).toHaveCount(sourceInitial - 1)
      await expect(targetColumn.locator('.kanban-card')).toHaveCount(targetInitial + 1)

      const targetTitles = await targetColumn.locator('.kanban-card-title').allTextContents()
      expect(targetTitles).toContain(cardTitle)
    })

    test('drag a card to a column that already has cards', async ({ page }) => {
      const sourceColumn = page.locator('.kanban-column').nth(0) // Backlog (3 cards)
      const targetColumn = page.locator('.kanban-column').nth(2) // In Progress (2 cards)

      const sourceInitial = await sourceColumn.locator('.kanban-card').count()
      const targetInitial = await targetColumn.locator('.kanban-card').count()

      await simulateDrop(page, 't1', 'col-backlog', 2)

      await expect(sourceColumn.locator('.kanban-card')).toHaveCount(sourceInitial - 1)
      await expect(targetColumn.locator('.kanban-card')).toHaveCount(targetInitial + 1)
    })
  })

  test.describe('DOM Stability', () => {
    test('surgical DOM updates: adding a task preserves existing card DOM nodes', async ({ page }) => {
      const backlogColumn = page.locator('.kanban-column').first()

      // Mark the first kanban card with a custom data attribute
      await backlogColumn
        .locator('.kanban-card')
        .first()
        .evaluate((el) => {
          el.setAttribute('data-stability-marker', 'survivor')
        })

      // Add a new task to the same column
      await backlogColumn.locator('.kanban-add-task').click()
      await backlogColumn.locator('input[type="text"]').fill('Stability test task')
      await backlogColumn.locator('input[type="text"]').press('Enter')

      // Should now have one more card
      await expect(backlogColumn.locator('.kanban-card')).toHaveCount(4)

      // The marker must survive — proves the DOM node was not recreated
      const marker = await backlogColumn
        .locator('.kanban-card')
        .first()
        .evaluate((el) => {
          return el.getAttribute('data-stability-marker')
        })
      expect(marker).toBe('survivor')
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      // The board is already rendered with columns and cards from beforeEach

      // No element in the entire document should have data-gea-compiled-child-root
      const count = await page.evaluate(() => {
        return document.querySelectorAll('[data-gea-compiled-child-root]').length
      })
      expect(count).toBe(0)
    })
  })

  test('typing in add-form input must not trigger full column rerender', async ({ page }) => {
    const backlogColumn = page.locator('.kanban-column').first()

    // Store references to existing card DOM nodes
    const cards = backlogColumn.locator('.kanban-card')
    const cardCount = await cards.count()
    await page.evaluate((count) => {
      ;(window as any).__cardRefs = []
      const cards = document.querySelectorAll('.kanban-column:first-child .kanban-card')
      for (let i = 0; i < count; i++) {
        ;(window as any).__cardRefs.push(cards[i])
      }
    }, cardCount)

    // Open add form
    await backlogColumn.locator('.kanban-add-task').click()
    const input = backlogColumn.locator('input[type="text"]')
    await expect(input).toBeVisible()

    // Store a JS reference to the input DOM node
    await input.evaluate((el) => {
      ;(window as any).__inputRef = el
    })

    // Type character by character
    await input.pressSequentially('New task')

    // Input must be the same DOM node (check identity via stored reference)
    const inputSame = await backlogColumn.locator('input[type="text"]').evaluate((el) => {
      return el === (window as any).__inputRef
    })
    expect(inputSame).toBe(true)

    // Existing cards must be the same DOM nodes
    for (let i = 0; i < cardCount; i++) {
      const same = await cards.nth(i).evaluate((el, idx) => {
        return el === (window as any).__cardRefs[idx]
      }, i)
      expect(same).toBe(true)
    }
  })
})
