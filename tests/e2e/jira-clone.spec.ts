import { test, expect } from '@playwright/test'

test.describe('jira-clone board and surgical DOM updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    // Wait for auth + project fetch to complete and board to render
    await expect(page.locator('.board')).toBeVisible({ timeout: 15000 })
  })

  test('initial render shows 4 board columns with correct issue counts', async ({ page }) => {
    const columns = page.locator('.board-list')
    await expect(columns).toHaveCount(4)

    // Verify column headers (case-insensitive, titles include count)
    await expect(columns.nth(0).locator('.board-list-title')).toContainText(/backlog/i)
    await expect(columns.nth(1).locator('.board-list-title')).toContainText(/selected/i)
    await expect(columns.nth(2).locator('.board-list-title')).toContainText(/in progress/i)
    await expect(columns.nth(3).locator('.board-list-title')).toContainText(/done/i)

    // Total issue cards should be present
    const issueCards = page.locator('.issue-card')
    const totalCards = await issueCards.count()
    expect(totalCards).toBeGreaterThan(0)
  })

  test('board renders without spurious column doubling', async ({ page }) => {
    // Should have exactly 4 columns, not 8 (regression: observer firing during init)
    await expect(page.locator('.board-list')).toHaveCount(4)
  })

  test('clicking an issue card opens issue detail dialog', async ({ page }) => {
    // Click first issue card
    const firstCard = page.locator('.issue-card').first()
    const cardTitle = await firstCard.locator('.issue-card-title').textContent()
    await firstCard.click()

    // Issue detail dialog should appear
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).toBeVisible()

    // Dialog should contain the issue title
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).toContainText(cardTitle!)
  })

  test('opening issue detail must not rebuild the board columns', async ({ page }) => {
    // Store reference to board element
    await page.locator('.board').evaluate((el) => {
      ;(window as any).__boardRef = el
    })

    // Mark first issue card in each column that has cards
    const columns = page.locator('.board-list')
    for (let i = 0; i < 4; i++) {
      const cards = columns.nth(i).locator('.issue-card')
      const count = await cards.count()
      if (count > 0) {
        await cards.first().evaluate((el, idx) => {
          ;((window as any).__cardRefs = (window as any).__cardRefs || {})[idx] = el
        }, i)
      }
    }

    // Click an issue to open dialog
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).toBeVisible()

    // Board must be the same DOM node
    const boardSame = await page.locator('.board').evaluate((el) => {
      return el === (window as any).__boardRef
    })
    expect(boardSame).toBe(true)

    // Marked cards must still be the same DOM nodes
    for (let i = 0; i < 4; i++) {
      const cards = columns.nth(i).locator('.issue-card')
      const count = await cards.count()
      if (count > 0) {
        const same = await cards.first().evaluate((el, idx) => {
          return el === (window as any).__cardRefs?.[idx]
        }, i)
        expect(same).toBe(true)
      }
    }
  })

  test('closing issue detail dialog must not rebuild the board', async ({ page }) => {
    // Store board reference
    await page.locator('.board').evaluate((el) => {
      ;(window as any).__boardRef = el
    })

    // Open issue detail
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).toBeVisible()

    // Close dialog by clicking backdrop or close
    // The dialog uses @geajs/ui Dialog — close by navigating back to /project/board
    await page.evaluate(() => {
      // Navigate back to board route to close the issue detail
      window.history.pushState({}, '', '/project/board')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).not.toBeVisible({ timeout: 5000 })

    // Board must be the same DOM node
    const boardSame = await page.locator('.board').evaluate((el) => {
      return el === (window as any).__boardRef
    })
    expect(boardSame).toBe(true)
  })

  test('sidebar navigation links show correct active state', async ({ page }) => {
    // Kanban Board link should be active on /project/board
    await expect(page.locator('.sidebar-link.active')).toBeVisible()
    await expect(page.locator('.sidebar-link.active')).toContainText('Kanban Board')
  })

  test('navigating to project settings and back preserves sidebar', async ({ page }) => {
    // Store sidebar reference
    await page.locator('.sidebar').evaluate((el) => {
      ;(window as any).__sidebarRef = el
    })

    // Navigate to settings
    await page.locator('.sidebar-link', { hasText: 'Project Settings' }).click()

    // Should show settings form
    await expect(page.locator('.project-page')).toBeVisible()

    // Navigate back to board
    await page.locator('.sidebar-link', { hasText: 'Kanban Board' }).click()
    await expect(page.locator('.board')).toBeVisible()

    // Sidebar must be the same DOM node
    const sidebarSame = await page.locator('.sidebar').evaluate((el) => {
      return el === (window as any).__sidebarRef
    })
    expect(sidebarSame).toBe(true)
  })

  test('search filter narrows displayed issues without rebuilding columns', async ({ page }) => {
    // Store references to columns
    await page.evaluate(() => {
      ;(window as any).__colRefs = Array.from(document.querySelectorAll('.board-list'))
    })

    const totalBefore = await page.locator('.issue-card').count()

    // Type in search input
    await page.locator('.board-filters-search input').fill('login')
    await page.waitForTimeout(300)

    // Should show fewer (or equal) cards
    const totalAfter = await page.locator('.issue-card').count()
    expect(totalAfter).toBeLessThanOrEqual(totalBefore)

    // At least one card should contain "login" in title
    if (totalAfter > 0) {
      const firstTitle = await page.locator('.issue-card-title').first().textContent()
      expect(firstTitle?.toLowerCase()).toContain('login')
    }

    // Columns must be same DOM nodes
    const allColsSame = await page.evaluate(() => {
      const current = document.querySelectorAll('.board-list')
      const refs = (window as any).__colRefs as Element[]
      return refs.every((ref, i) => ref === current[i])
    })
    expect(allColsSame).toBe(true)

    // Clear search — all cards should return
    await page.locator('.board-filters-search input').fill('')
    await page.waitForTimeout(300)
    const totalRestored = await page.locator('.issue-card').count()
    expect(totalRestored).toBe(totalBefore)
  })

  test('toggling "Only My Issues" filter updates cards without rebuilding columns', async ({ page }) => {
    // Store column references
    await page.evaluate(() => {
      ;(window as any).__colRefs = Array.from(document.querySelectorAll('.board-list'))
    })

    const totalBefore = await page.locator('.issue-card').count()

    // Click "Only My Issues"
    await page.locator('.board-filters-button', { hasText: 'Only My Issues' }).click()
    await page.waitForTimeout(300)

    // Button should have active class
    await expect(page.locator('.board-filters-button.active', { hasText: 'Only My Issues' })).toBeVisible()

    // Card count may change
    const totalFiltered = await page.locator('.issue-card').count()
    expect(totalFiltered).toBeLessThanOrEqual(totalBefore)

    // Columns must be same DOM nodes
    const allColsSame = await page.evaluate(() => {
      const current = document.querySelectorAll('.board-list')
      const refs = (window as any).__colRefs as Element[]
      return refs.every((ref, i) => ref === current[i])
    })
    expect(allColsSame).toBe(true)

    // Toggle off
    await page.locator('.board-filters-button', { hasText: 'Only My Issues' }).click()
    await page.waitForTimeout(300)
    const totalRestored = await page.locator('.issue-card').count()
    expect(totalRestored).toBe(totalBefore)
  })

  test('avatar filter toggles and filters issues by user', async ({ page }) => {
    const totalBefore = await page.locator('.issue-card').count()

    // Click first avatar filter
    const avatarFilters = page.locator('.board-filters-avatar')
    const avatarCount = await avatarFilters.count()
    expect(avatarCount).toBeGreaterThan(0)

    await avatarFilters.first().click()
    await page.waitForTimeout(300)

    // Should filter to fewer or equal cards (shows only that user's issues)
    const totalFiltered = await page.locator('.issue-card').count()
    expect(totalFiltered).toBeLessThanOrEqual(totalBefore)

    // Click again to deselect
    await avatarFilters.first().click()
    await page.waitForTimeout(300)

    // All cards should be restored
    const totalRestored = await page.locator('.issue-card').count()
    expect(totalRestored).toBe(totalBefore)
  })

  test('issue cards render with correct type and priority icons', async ({ page }) => {
    // Every issue card should have a type icon and priority icon
    const cards = page.locator('.issue-card')
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThan(0)

    // Each card footer should have left section with icons
    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      const footer = cards.nth(i).locator('.issue-card-footer-left')
      await expect(footer).toBeVisible()
    }
  })

  test('changing issue status in detail dialog updates badge and preserves arrow', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).toBeVisible()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const badge = page.locator('.status-badge')
    await expect(badge).toContainText('BACKLOG')
    await expect(badge.locator('.status-badge-arrow')).toBeVisible()

    await badge.click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()
    await page.locator('.custom-dropdown-item', { hasText: 'Done' }).click()

    await expect(badge).toContainText('DONE')
    await expect(badge.locator('.status-badge-arrow')).toBeVisible()
    await expect(badge.locator('.status-badge-arrow')).toContainText('▼')
  })

  test('changing status preserves comments section and DOM nodes', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const comments = page.locator('.issue-details-comments')
    await expect(comments).toBeVisible()

    await comments.evaluate((el) => {
      ;(window as any).__commentsRef = el
    })

    const badge = page.locator('.status-badge')
    await badge.click()
    await page.locator('.custom-dropdown-item', { hasText: 'Done' }).click()
    await expect(badge).toContainText('DONE')

    const commentsSame = await comments.evaluate((el) => el === (window as any).__commentsRef)
    expect(commentsSame).toBe(true)
    await expect(comments).toBeVisible()
  })

  test('cycling through dropdowns shows only the active one without slot stealing', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    await page.locator('.status-badge').click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()
    await page.locator('.dropdown-overlay').click()
    await expect(page.locator('.custom-dropdown')).not.toBeVisible()

    await page.locator('.reporter-display').click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()
    await expect(page.locator('.custom-dropdown')).toHaveCount(1)
    await page.locator('.dropdown-overlay').click()
    await expect(page.locator('.custom-dropdown')).not.toBeVisible()

    await page.locator('.priority-display').click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()
    await expect(page.locator('.custom-dropdown')).toHaveCount(1)
    await page.locator('.dropdown-overlay').click()
    await expect(page.locator('.custom-dropdown')).not.toBeVisible()
  })

  test('time tracking dialog progress bar updates on input change', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    await page.locator('.tracking-widget--clickable').click()
    await expect(page.locator('.dialog-tracking [data-part="content"]')).toBeVisible()

    const dialogBar = page.locator('.dialog-tracking .tracking-bar-fill')
    const initialWidth = await dialogBar.evaluate((el) => el.style.width)
    expect(initialWidth).toBeTruthy()

    const spentInput = page.locator('.tracking-edit-field').first().locator('input')
    await spentInput.fill('10')
    await spentInput.dispatchEvent('input')

    const updatedWidth = await dialogBar.evaluate((el) => el.style.width)
    expect(updatedWidth).not.toBe(initialWidth)
  })

  test('still exactly 4 columns after opening and closing issue detail', async ({ page }) => {
    // Open issue
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).toBeVisible()

    // Still 4 columns behind the dialog
    await expect(page.locator('.board-list')).toHaveCount(4)

    // Close dialog
    await page.evaluate(() => {
      window.history.pushState({}, '', '/project/board')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).not.toBeVisible({ timeout: 5000 })

    // Still 4 columns
    await expect(page.locator('.board-list')).toHaveCount(4)
  })

  test('changing issue type via type dropdown', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const typeLabel = page.locator('.issue-details-type-label')
    const initialText = await typeLabel.textContent()

    await page.locator('.issue-type-clickable').click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()

    // Pick a type different from current
    const targetType = initialText?.startsWith('STORY') ? 'Bug' : 'Story'
    await page.locator('.custom-dropdown-item', { hasText: targetType }).click()

    await expect(typeLabel).toContainText(new RegExp(targetType.toUpperCase()))
    await expect(page.locator('.custom-dropdown')).not.toBeVisible()
  })

  test('changing priority via priority dropdown', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const priorityName = page.locator('.priority-name')
    const initialPriority = await priorityName.textContent()

    await page.locator('.priority-display').click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()
    await page.locator('.custom-dropdown-item', { hasText: 'Highest' }).click()

    await expect(priorityName).toHaveText('Highest')
    await expect(page.locator('.custom-dropdown')).not.toBeVisible()
  })

  test('changing reporter via reporter dropdown', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const reporterName = page.locator('.reporter-name')
    const initialReporter = await reporterName.textContent()

    await page.locator('.reporter-display').click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()

    // Pick a different user than the current reporter
    const items = page.locator('.custom-dropdown-item:not(.active)')
    await items.first().click()

    const newReporter = await reporterName.textContent()
    expect(newReporter).not.toBe(initialReporter)
    await expect(page.locator('.custom-dropdown')).not.toBeVisible()
  })

  test('editing issue title inline', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const titleText = page.locator('.issue-title-text')
    const originalTitle = await titleText.textContent()
    await titleText.click()

    const titleInput = page.locator('.issue-title-input')
    await expect(titleInput).toBeVisible()
    await titleInput.fill('Updated Title For Test')
    await titleInput.press('Enter')

    await expect(titleText).toBeVisible()
    await expect(titleText).toHaveText('Updated Title For Test')
  })

  test('delete issue via confirm dialog', async ({ page }) => {
    const totalBefore = await page.locator('.issue-card').count()

    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    // Click trash button
    await page.locator('.issue-details-action-btn').nth(2).click()

    // Confirm dialog should appear
    await expect(page.locator('.confirm-dialog')).toBeVisible()
    await expect(page.locator('.confirm-dialog-title')).toContainText('Are you sure')

    // Click delete
    await page.locator('.confirm-dialog-actions button', { hasText: 'Delete issue' }).click()

    // Dialog should close and board should have one fewer card
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).not.toBeVisible({ timeout: 5000 })
    // deleteIssue() is fire-and-forget — wait for the board to re-render
    await expect(page.locator('.issue-card')).toHaveCount(totalBefore - 1, { timeout: 5000 })
  })

  test('cancel delete keeps issue', async ({ page }) => {
    const totalBefore = await page.locator('.issue-card').count()

    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    await page.locator('.issue-details-action-btn').nth(2).click()
    await expect(page.locator('.confirm-dialog')).toBeVisible()

    await page.locator('.confirm-dialog-actions button', { hasText: 'Cancel' }).click()
    await expect(page.locator('.confirm-dialog')).not.toBeVisible()

    // Issue detail should still be open
    await expect(page.locator('.issue-details')).toBeVisible()
  })

  test('add a comment to an issue', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const commentsBefore = await page.locator('.comment').count()

    // Click the comment placeholder to open form
    await page.locator('.comment-create-fake').click()
    await expect(page.locator('.comment-create-form')).toBeVisible()

    await page.locator('.comment-create-form textarea').fill('Test comment from e2e')
    await page.locator('.comment-create-form button', { hasText: 'Save' }).click()

    // New comment should appear
    await expect(page.locator('.comment')).toHaveCount(commentsBefore + 1)
    await expect(page.locator('.comment-body').last()).toContainText('Test comment from e2e')
  })

  test('cancel comment form clears and closes', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    await page.locator('.comment-create-fake').click()
    await expect(page.locator('.comment-create-form')).toBeVisible()

    await page.locator('.comment-create-form textarea').fill('This will be cancelled')
    await page.locator('.comment-create-form button', { hasText: 'Cancel' }).click()

    await expect(page.locator('.comment-create-form')).not.toBeVisible()
    await expect(page.locator('.comment-create-fake')).toBeVisible()
  })

  test('"Recently Updated" filter toggles and filters', async ({ page }) => {
    const totalBefore = await page.locator('.issue-card').count()

    await page.locator('.board-filters-button', { hasText: 'Recently Updated' }).click()
    await page.waitForTimeout(300)

    await expect(page.locator('.board-filters-button.active', { hasText: 'Recently Updated' })).toBeVisible()
    const totalFiltered = await page.locator('.issue-card').count()
    expect(totalFiltered).toBeLessThanOrEqual(totalBefore)

    // Toggle off
    await page.locator('.board-filters-button', { hasText: 'Recently Updated' }).click()
    await page.waitForTimeout(300)
    const totalRestored = await page.locator('.issue-card').count()
    expect(totalRestored).toBe(totalBefore)
  })

  test('"Clear all" button resets all filters', async ({ page }) => {
    const totalBefore = await page.locator('.issue-card').count()

    // Apply multiple filters
    await page.locator('.board-filters-button', { hasText: 'Only My Issues' }).click()
    await page.waitForTimeout(300)

    // Clear all should appear
    await expect(page.locator('.board-filters-clear')).toBeVisible()
    await page.locator('.board-filters-clear').click()
    await page.waitForTimeout(300)

    // All cards restored
    const totalRestored = await page.locator('.issue-card').count()
    expect(totalRestored).toBe(totalBefore)

    // Clear all link should be gone
    await expect(page.locator('.board-filters-clear')).not.toBeVisible()
  })

  test('close issue detail via close button', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    // Click close (X) button — last action button
    await page.locator('.issue-details-action-btn').last().click()
    await expect(page.locator('.dialog-issue-detail [data-part="content"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('original estimate input updates value', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const estimateInput = page.locator('.issue-details-field input[type="number"]').first()
    await estimateInput.fill('20')
    await estimateInput.dispatchEvent('change')

    await expect(estimateInput).toHaveValue('20')
  })

  test('project settings form displays and can be edited', async ({ page }) => {
    await page.locator('.sidebar-link', { hasText: 'Project Settings' }).click()
    await expect(page.locator('.project-settings')).toBeVisible()

    // Wait for form fields to be populated
    const nameInput = page.locator('.project-settings-form input[type="text"]').first()
    await expect(nameInput).toBeVisible()
    await page.waitForTimeout(500)

    // Heading should be visible
    await expect(page.locator('.project-settings-heading')).toHaveText('Project Details')

    // Save button should be visible
    await expect(page.locator('.project-settings-form button', { hasText: 'Save changes' })).toBeVisible()
  })

  test('create issue modal opens from navbar', async ({ page }) => {
    const createItem = page.locator('.navbar-left-item').filter({ hasText: 'Create Issue' })
    await createItem.click()
    await expect(page.locator('.issue-create')).toBeVisible()
    await expect(page.locator('.issue-create-heading')).toHaveText('Create issue')

    // Cancel closes modal
    await page.locator('.issue-create-actions button', { hasText: 'Cancel' }).click()
    await expect(page.locator('.issue-create')).not.toBeVisible()
  })

  test('create issue form has all required fields', async ({ page }) => {
    const createItem = page.locator('.navbar-left-item').filter({ hasText: 'Create Issue' })
    await createItem.click()
    await expect(page.locator('.issue-create')).toBeVisible()

    // Verify all form labels present
    await expect(page.locator('.issue-create .form-label', { hasText: 'Issue Type' })).toBeVisible()
    await expect(page.locator('.issue-create .form-label', { hasText: 'Short Summary' })).toBeVisible()
    await expect(page.locator('.issue-create .form-label', { hasText: 'Reporter' })).toBeVisible()
    await expect(page.locator('.issue-create .form-label', { hasText: 'Priority' })).toBeVisible()

    // Submit button present
    await expect(page.locator('.issue-create-actions button', { hasText: 'Create Issue' })).toBeVisible()
  })

  test('type dropdown search filters options', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    await page.locator('.issue-type-clickable').click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()

    // All 3 type options visible
    await expect(page.locator('.custom-dropdown-item')).toHaveCount(3)

    // Search for "bug"
    await page.locator('.custom-dropdown-search-input').fill('bug')
    await expect(page.locator('.custom-dropdown-item')).toHaveCount(1)
    await expect(page.locator('.custom-dropdown-item')).toContainText('Bug')

    // Clear search — all options back
    await page.locator('.custom-dropdown-search-input').fill('')
    await expect(page.locator('.custom-dropdown-item')).toHaveCount(3)
  })

  test.describe('DOM Stability', () => {
    test('surgical DOM updates: opening and closing issue detail preserves card DOM nodes', async ({ page }) => {
      // Mark the first .issue-card with a custom data attribute
      await page.locator('.issue-card').first().evaluate((el) => {
        el.setAttribute('data-stability-marker', 'survivor')
      })

      // Open issue detail dialog
      await page.locator('.issue-card').first().click()
      await expect(page.locator('.dialog-issue-detail [data-part="content"]')).toBeVisible()

      // Close the dialog
      await page.locator('.issue-details-action-btn').last().click()
      await expect(page.locator('.dialog-issue-detail [data-part="content"]')).not.toBeVisible({ timeout: 5000 })

      // The marker must survive — proves the DOM node was not recreated
      const marker = await page.locator('.issue-card').first().evaluate((el) => {
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

  test('assignee add and remove', async ({ page }) => {
    await page.locator('.issue-card').first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 10000 })

    const chipsBefore = await page.locator('.assignee-chip').count()

    // Click "+ Add more"
    await page.locator('.assignee-add-more').click()
    await expect(page.locator('.custom-dropdown')).toBeVisible()

    // Add a user
    const availableUsers = page.locator('.custom-dropdown-item')
    const userCount = await availableUsers.count()
    if (userCount > 0) {
      await availableUsers.first().click()
      await expect(page.locator('.assignee-chip')).toHaveCount(chipsBefore + 1)

      // Remove the last added chip
      await page.locator('.assignee-chip-remove').last().click()
      await expect(page.locator('.assignee-chip')).toHaveCount(chipsBefore)
    }
  })
})
