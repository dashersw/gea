import { test, expect } from '@playwright/test'

test.describe('todo-app surgical DOM updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.todo-app')).toBeVisible()
  })

  test('adding a todo must surgically append, not rebuild the list', async ({ page }) => {
    // Add first todo
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(1)

    // Tag the first item's DOM node with a data attribute so we can verify identity
    await page
      .locator('.todo-item')
      .first()
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'first')
      })

    // Add second todo
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(2)

    // The first item must still have its marker — same DOM node, not recreated
    const firstHasMarker = await page
      .locator('.todo-item')
      .first()
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    expect(firstHasMarker).toBe('first')

    // Add a third todo — both previous markers must survive
    await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'second')
      })

    await page.locator('.todo-input').fill('Clean house')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(3)

    const firstStillMarked = await page
      .locator('.todo-item')
      .first()
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    const secondStillMarked = await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    expect(firstStillMarked).toBe('first')
    expect(secondStillMarked).toBe('second')
  })

  test('toggling a todo must not rebuild the list', async ({ page }) => {
    // Add two todos
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(2)

    // Mark both DOM nodes
    await page
      .locator('.todo-item')
      .first()
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'first')
      })
    await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'second')
      })

    // Toggle first todo
    await page.locator('.todo-checkbox').first().click()

    // Both DOM nodes must survive
    const firstMarker = await page
      .locator('.todo-item')
      .first()
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    const secondMarker = await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    expect(firstMarker).toBe('first')
    expect(secondMarker).toBe('second')
  })

  test('removing a todo must not rebuild surviving items', async ({ page }) => {
    // Add three todos
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Clean house')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(3)

    // Mark second and third
    await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'second')
      })
    await page
      .locator('.todo-item')
      .nth(2)
      .evaluate((el) => {
        el.setAttribute('data-test-marker', 'third')
      })

    // Remove first todo
    await page.locator('.todo-remove').first().click()
    await expect(page.locator('.todo-item')).toHaveCount(2)

    // Surviving items must keep their markers
    const newFirstMarker = await page
      .locator('.todo-item')
      .first()
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    const newSecondMarker = await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        return el.getAttribute('data-test-marker')
      })
    expect(newFirstMarker).toBe('second')
    expect(newSecondMarker).toBe('third')
  })

  test('adding a todo must not detach/reattach existing items in the DOM', async ({ page }) => {
    // Add two todos so we have a baseline list
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(2)

    // Store JS references to existing item DOM nodes
    await page.evaluate(() => {
      ;(window as any).__itemRefs = Array.from(document.querySelectorAll('.todo-item'))
    })

    // Add a third todo
    await page.locator('.todo-input').fill('Clean house')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(3)

    // Existing items must be the same DOM nodes (not recreated)
    const allSame = await page.evaluate(() => {
      const currentItems = document.querySelectorAll('.todo-item')
      const refs = (window as any).__itemRefs as Element[]
      return refs.every((ref, i) => ref === currentItems[i])
    })
    expect(allSame).toBe(true)
  })

  test('toggling a todo must not detach/reattach any items in the DOM', async ({ page }) => {
    // Add two todos
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(2)

    // Install MutationObserver on .todo-list
    await page.evaluate(() => {
      const container = document.querySelector('.todo-list')!
      ;(window as any).__removedNodes = []
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.removedNodes)) {
            if (node.nodeType === 1) {
              ;(window as any).__removedNodes.push((node as HTMLElement).outerHTML.slice(0, 80))
            }
          }
        }
      })
      observer.observe(container, { childList: true })
      ;(window as any).__mutationObserver = observer
    })

    // Toggle first todo
    await page.locator('.todo-checkbox').first().click()

    // No nodes should have been removed from .todo-list
    const removedNodes = await page.evaluate(() => (window as any).__removedNodes)
    expect(removedNodes).toEqual([])

    await page.evaluate(() => {
      ;(window as any).__mutationObserver?.disconnect()
    })
  })

  test('filters: switching to Active hides completed items', async ({ page }) => {
    // Add two todos
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(2)

    // Complete the first todo
    await page.locator('.todo-checkbox').first().click()
    await expect(page.locator('.todo-item.done')).toHaveCount(1)

    // Switch to Active filter
    await page.locator('.filter-btn', { hasText: 'Active' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(1)
    await expect(page.locator('.todo-text')).toHaveText('Walk dog')

    // Active filter button must have active class
    await expect(page.locator('.filter-btn.active')).toHaveText('Active')
  })

  test('filters: switching to Completed shows only completed items', async ({ page }) => {
    // Add two todos, complete one
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-checkbox').first().click()

    // Switch to Completed filter
    await page.locator('.filter-btn', { hasText: 'Completed' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(1)
    await expect(page.locator('.todo-text')).toHaveText('Buy milk')
  })

  test('filters: switching back to All restores full list', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-checkbox').first().click()

    // Active filter
    await page.locator('.filter-btn', { hasText: 'Active' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(1)

    // Back to All
    await page.locator('.filter-btn', { hasText: 'All' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(2)
  })

  test('filters: items surviving a filter change are the same DOM nodes', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    // Complete first, so "Walk dog" stays in Active
    await page.locator('.todo-checkbox').first().click()

    // Store reference to the active item (Walk dog)
    await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        ;(window as any).__activeRef = el
      })

    // Switch to Active filter — Walk dog should survive
    await page.locator('.filter-btn', { hasText: 'Active' }).click()
    await expect(page.locator('.todo-item')).toHaveCount(1)

    const same = await page
      .locator('.todo-item')
      .first()
      .evaluate((el) => {
        return el === (window as any).__activeRef
      })
    expect(same).toBe(true)
  })

  test('counter: "X items left" updates after adding/toggling/removing', async ({ page }) => {
    // No filters shown when no todos
    await expect(page.locator('.todo-filters')).not.toBeVisible()

    // Add a todo — filters should appear
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-filters')).toBeVisible()
    await expect(page.locator('.todo-count').first()).toContainText('1 item left')

    // Add another
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-count').first()).toContainText('2 items left')

    // Toggle one — count decreases
    await page.locator('.todo-checkbox').first().click()
    await expect(page.locator('.todo-count').first()).toContainText('1 item left')

    // Completed count should appear
    await expect(page.locator('.todo-count.completed')).toContainText('1 completed')

    // Remove the completed one
    await page.locator('.todo-remove').first().click()
    await expect(page.locator('.todo-count').first()).toContainText('1 item left')
    await expect(page.locator('.todo-count.completed')).not.toBeVisible()
  })

  test('inline rename: double-click opens edit mode, Enter commits', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(1)

    // Double-click the text to edit
    await page.locator('.todo-text').dblclick()
    await expect(page.locator('.todo-edit')).toBeVisible()
    await expect(page.locator('.todo-item.editing')).toHaveCount(1)

    // Clear and type new text
    await page.locator('.todo-edit').fill('Buy oat milk')
    await page.locator('.todo-edit').press('Enter')

    // Edit mode should close
    await expect(page.locator('.todo-edit')).not.toBeVisible()
    await expect(page.locator('.todo-text')).toHaveText('Buy oat milk')
  })

  test('inline rename: Escape cancels without changing text', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')

    // Double-click to edit
    await page.locator('.todo-text').dblclick()
    await expect(page.locator('.todo-edit')).toBeVisible()

    // Type something different then Escape
    await page.locator('.todo-edit').fill('Something else')
    await page.locator('.todo-edit').press('Escape')

    // Text must be unchanged
    await expect(page.locator('.todo-edit')).not.toBeVisible()
    await expect(page.locator('.todo-text')).toHaveText('Buy milk')
  })

  test('inline rename: renaming a todo does not detach other items', async ({ page }) => {
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')

    // Store reference to second item
    await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        ;(window as any).__secondRef = el
      })

    // Rename first item
    await page.locator('.todo-text').first().dblclick()
    await page.locator('.todo-edit').fill('Buy oat milk')
    await page.locator('.todo-edit').press('Enter')
    await expect(page.locator('.todo-text').first()).toHaveText('Buy oat milk')

    // Second item must be same DOM node
    const same = await page
      .locator('.todo-item')
      .nth(1)
      .evaluate((el) => {
        return el === (window as any).__secondRef
      })
    expect(same).toBe(true)
  })

  test('adding empty text is a no-op', async ({ page }) => {
    // Press Enter with empty input
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(0)

    // Type whitespace and press Enter
    await page.locator('.todo-input').fill('   ')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(0)
  })

  test('TodoFilters only renders when todos exist', async ({ page }) => {
    // No todos — filters hidden
    await expect(page.locator('.todo-filters')).not.toBeVisible()

    // Add a todo — filters appear
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-filters')).toBeVisible()

    // Remove last todo — filters should disappear
    await page.locator('.todo-remove').click()
    await expect(page.locator('.todo-item')).toHaveCount(0)
    await expect(page.locator('.todo-filters')).not.toBeVisible()
  })

  test('removing a todo does not detach surviving items via MutationObserver', async ({ page }) => {
    // Add three todos
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Clean house')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(3)

    // Install MutationObserver on .todo-list
    await page.evaluate(() => {
      const container = document.querySelector('.todo-list')!
      ;(window as any).__removedNodes = []
      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of Array.from(m.removedNodes)) {
            if (node.nodeType === 1) {
              ;(window as any).__removedNodes.push((node as HTMLElement).className)
            }
          }
        }
      })
      observer.observe(container, { childList: true })
      ;(window as any).__mutationObserver = observer
    })

    // Remove second todo
    await page.locator('.todo-remove').nth(1).click()
    await expect(page.locator('.todo-item')).toHaveCount(2)

    // Only 1 node should have been removed (the deleted item itself)
    const removedNodes = await page.evaluate(() => (window as any).__removedNodes)
    expect(removedNodes.length).toBe(1)

    await page.evaluate(() => (window as any).__mutationObserver?.disconnect())
  })

  test.describe('DOM Stability', () => {
    test('surgical DOM updates: adding a todo preserves existing DOM nodes', async ({ page }) => {
      // Add a todo so we have an element to mark
      await page.locator('.todo-input').fill('Buy milk')
      await page.locator('.todo-input').press('Enter')
      await expect(page.locator('.todo-item')).toHaveCount(1)

      // Mark the first .todo-item with a custom data attribute
      await page
        .locator('.todo-item')
        .first()
        .evaluate((el) => {
          el.setAttribute('data-stability-marker', 'survivor')
        })

      // Add a new todo
      await page.locator('.todo-input').fill('Walk dog')
      await page.locator('.todo-input').press('Enter')
      await expect(page.locator('.todo-item')).toHaveCount(2)

      // The marker must survive — proves the DOM node was not recreated
      const marker = await page
        .locator('.todo-item')
        .first()
        .evaluate((el) => {
          return el.getAttribute('data-stability-marker')
        })
      expect(marker).toBe('survivor')
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      // Add a couple of todos to populate the DOM
      await page.locator('.todo-input').fill('Buy milk')
      await page.locator('.todo-input').press('Enter')
      await page.locator('.todo-input').fill('Walk dog')
      await page.locator('.todo-input').press('Enter')
      await expect(page.locator('.todo-item')).toHaveCount(2)

      // No element in the entire document should have data-gea-compiled-child-root
      const count = await page.evaluate(() => {
        return document.querySelectorAll('[data-gea-compiled-child-root]').length
      })
      expect(count).toBe(0)
    })
  })

  test('typing in the todo input does not trigger list rerender', async ({ page }) => {
    // Add two todos first
    await page.locator('.todo-input').fill('Buy milk')
    await page.locator('.todo-input').press('Enter')
    await page.locator('.todo-input').fill('Walk dog')
    await page.locator('.todo-input').press('Enter')
    await expect(page.locator('.todo-item')).toHaveCount(2)

    // Store references to items
    await page.evaluate(() => {
      ;(window as any).__itemRefs = Array.from(document.querySelectorAll('.todo-item'))
    })

    // Type in the input
    await page.locator('.todo-input').pressSequentially('New todo text')

    // Items must be same DOM nodes
    const allSame = await page.evaluate(() => {
      const current = document.querySelectorAll('.todo-item')
      const refs = (window as any).__itemRefs as Element[]
      return refs.every((ref, i) => ref === current[i])
    })
    expect(allSame).toBe(true)
  })
})

test.describe('CSS animation and transition event delegation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/animation-events-test.html')
    await expect(page.locator('.anim-test')).toBeVisible()
  })

  test('animationstart fires through Gea event delegation', async ({ page }) => {
    await expect(page.locator('.r-anim-start')).toHaveText('true', { timeout: 2000 })
  })

  test('animationend fires through Gea event delegation', async ({ page }) => {
    await expect(page.locator('.r-anim-end')).toHaveText('true', { timeout: 2000 })
  })

  test('animationiteration fires through Gea event delegation', async ({ page }) => {
    await expect(page.locator('.r-anim-iter')).toHaveText('true', { timeout: 2000 })
  })

  test('transitionrun fires through Gea event delegation', async ({ page }) => {
    await page.locator('.trigger-transition').click()
    await expect(page.locator('.r-trans-run')).toHaveText('true', { timeout: 2000 })
  })

  test('transitionstart fires through Gea event delegation', async ({ page }) => {
    await page.locator('.trigger-transition').click()
    await expect(page.locator('.r-trans-start')).toHaveText('true', { timeout: 2000 })
  })

  test('transitionend fires through Gea event delegation', async ({ page }) => {
    await page.locator('.trigger-transition').click()
    await expect(page.locator('.r-trans-end')).toHaveText('true', { timeout: 2000 })
  })
})
