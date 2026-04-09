import { test, expect, type Page } from '@playwright/test'

/** Cards inside Kanban columns only (avoids duplicate ghost nodes outside `.board-lists`). */
function boardIssueCards(page: Page) {
  return page.locator('.board-lists .issue-card')
}

/** Active issue detail dialog — prefer last when duplicate subtrees exist. */
function issueDetail(page: Page) {
  return page.locator('.dialog-issue-detail').last()
}

test.describe('jira-clone board and surgical DOM updates', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    // Reset mock API state so each test starts from seed data
    await page.request.post('/api/__reset')
    await page.goto('/')
    // Wait for auth + project fetch to complete and board to render
    await expect(page.locator('.board')).toBeVisible({ timeout: 500 })
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
    const issueCards = boardIssueCards(page)
    const totalCards = await issueCards.count()
    expect(totalCards).toBeGreaterThan(0)
  })

  test('board renders without spurious column doubling', async ({ page }) => {
    // Should have exactly 4 columns, not 8 (regression: observer firing during init)
    await expect(page.locator('.board-list')).toHaveCount(4)
  })

  test('clicking an issue card opens issue detail dialog', async ({ page }) => {
    // Click first issue card
    const firstCard = boardIssueCards(page).first()
    const cardTitle = await firstCard.locator('.issue-card-title').textContent()
    await firstCard.click()

    // Issue detail dialog should appear
    await expect(issueDetail(page).locator('[data-part="content"]')).toBeVisible()

    // Dialog should contain the issue title
    await expect(issueDetail(page).locator('[data-part="content"]')).toContainText(cardTitle!)
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
    await boardIssueCards(page).first().click()
    await expect(issueDetail(page).locator('[data-part="content"]')).toBeVisible()

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
    await boardIssueCards(page).first().click()
    await expect(issueDetail(page).locator('[data-part="content"]')).toBeVisible()

    // Close dialog by clicking backdrop or close
    // The dialog uses @geajs/ui Dialog — close by navigating back to /project/board
    await page.evaluate(() => {
      // Navigate back to board route to close the issue detail
      window.history.pushState({}, '', '/project/board')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(issueDetail(page).locator('[data-part="content"]')).not.toBeVisible({ timeout: 500 })

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

    const totalBefore = await boardIssueCards(page).count()

    // Type in search input
    await page.locator('.board-filters-search input').fill('login')
    await page.waitForTimeout(300)

    // Should show fewer (or equal) cards
    const totalAfter = await boardIssueCards(page).count()
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
    const totalRestored = await boardIssueCards(page).count()
    expect(totalRestored).toBe(totalBefore)
  })

  test('toggling "Only My Issues" filter updates cards without rebuilding columns', async ({ page }) => {
    // Store column references
    await page.evaluate(() => {
      ;(window as any).__colRefs = Array.from(document.querySelectorAll('.board-list'))
    })

    const totalBefore = await boardIssueCards(page).count()

    // Click "Only My Issues"
    await page.locator('.board-filters-button', { hasText: 'Only My Issues' }).click()
    await page.waitForTimeout(300)

    // Button should have active class
    await expect(page.locator('.board-filters-button.active', { hasText: 'Only My Issues' })).toBeVisible()

    // Card count may change
    const totalFiltered = await boardIssueCards(page).count()
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
    const totalRestored = await boardIssueCards(page).count()
    expect(totalRestored).toBe(totalBefore)
  })

  test('avatar filter toggles and filters issues by user', async ({ page }) => {
    const totalBefore = await boardIssueCards(page).count()

    // Click first avatar filter
    const avatarFilters = page.locator('.board-filters-avatar')
    const avatarCount = await avatarFilters.count()
    expect(avatarCount).toBeGreaterThan(0)

    await avatarFilters.first().click()
    await page.waitForTimeout(300)

    // Should filter to fewer or equal cards (shows only that user's issues)
    const totalFiltered = await boardIssueCards(page).count()
    expect(totalFiltered).toBeLessThanOrEqual(totalBefore)

    // Click again to deselect
    await avatarFilters.first().click()
    await page.waitForTimeout(300)

    // All cards should be restored
    const totalRestored = await boardIssueCards(page).count()
    expect(totalRestored).toBe(totalBefore)
  })

  test('issue cards render with correct type and priority icons', async ({ page }) => {
    // Every issue card should have a type icon and priority icon
    const cards = boardIssueCards(page)
    const cardCount = await cards.count()
    expect(cardCount).toBeGreaterThan(0)

    // Each card footer should have left section with icons
    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      const footer = cards.nth(i).locator('.issue-card-footer-left')
      await expect(footer).toBeVisible()
    }
  })

  test('changing issue status in detail dialog updates badge and preserves arrow', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(issueDetail(page).locator('[data-part="content"]')).toBeVisible()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const badge = page.locator('.status-badge')
    await expect(badge).toContainText('BACKLOG')
    await expect(badge.locator('.status-badge-arrow')).toBeVisible()

    await badge.click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()
    await page.locator('.custom-dropdown-item', { hasText: 'Done' }).click()

    await expect(badge).toContainText('DONE')
    await expect(badge.locator('.status-badge-arrow')).toBeVisible()
    await expect(badge.locator('.status-badge-arrow')).toContainText('▼')
  })

  test('changing status preserves comments section and DOM nodes', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

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
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    await page.locator('.status-badge').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()
    await page.locator('.dropdown-overlay').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).not.toBeVisible()

    await page.locator('.reporter-display').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()
    await expect(issueDetail(page).locator('.custom-dropdown')).toHaveCount(1)
    await page.locator('.dropdown-overlay').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).not.toBeVisible()

    await page.locator('.priority-display').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()
    await expect(issueDetail(page).locator('.custom-dropdown')).toHaveCount(1)
    await page.locator('.dropdown-overlay').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).not.toBeVisible()
  })

  test('time tracking dialog progress bar updates on input change', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    await page.locator('.tracking-widget--clickable').click()
    await expect(page.locator('.dialog-tracking [data-part="content"]')).toBeVisible()

    const dialogBar = page.locator('.dialog-tracking .tracking-bar-fill')
    // Wait for the tracking bar style to be rendered (reactive update may need a tick)
    await expect(dialogBar).toHaveAttribute('style', /width/, { timeout: 2000 })
    const initialWidth = await dialogBar.evaluate((el) => el.style.width)
    expect(initialWidth).toBeTruthy()

    const spentInput = page.locator('.tracking-edit-field').first().locator('input')
    await spentInput.fill('10')
    await spentInput.dispatchEvent('input')

    // Wait for the updated width to differ from initial
    await expect(async () => {
      const w = await dialogBar.evaluate((el) => el.style.width)
      expect(w).not.toBe(initialWidth)
    }).toPass({ timeout: 2000 })
  })

  test('still exactly 4 columns after opening and closing issue detail', async ({ page }) => {
    // Open issue
    await boardIssueCards(page).first().click()
    await expect(issueDetail(page).locator('[data-part="content"]')).toBeVisible()

    // Still 4 columns behind the dialog
    await expect(page.locator('.board-list')).toHaveCount(4)

    // Close dialog
    await page.evaluate(() => {
      window.history.pushState({}, '', '/project/board')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await expect(issueDetail(page).locator('[data-part="content"]')).not.toBeVisible({ timeout: 500 })

    // Still 4 columns
    await expect(page.locator('.board-list')).toHaveCount(4)
  })

  test('changing issue type via type dropdown', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const typeLabel = page.locator('.issue-details-type-label')
    const initialText = await typeLabel.textContent()

    await page.locator('.issue-type-clickable').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()

    // Pick a type different from current
    const targetType = initialText?.startsWith('STORY') ? 'Bug' : 'Story'
    await page.locator('.custom-dropdown-item', { hasText: targetType }).click()

    await expect(typeLabel).toContainText(new RegExp(targetType.toUpperCase()))
    await expect(issueDetail(page).locator('.custom-dropdown')).not.toBeVisible()
  })

  test('changing priority via priority dropdown', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const priorityName = page.locator('.priority-name')
    await page.locator('.priority-display').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()
    await page.locator('.custom-dropdown-item', { hasText: 'Highest' }).click()

    await expect(priorityName).toHaveText('Highest')
    await expect(issueDetail(page).locator('.custom-dropdown')).not.toBeVisible()
  })

  test('changing reporter via reporter dropdown', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const reporterName = page.locator('.reporter-name')
    const initialReporter = await reporterName.textContent()

    await page.locator('.reporter-display').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()

    // Pick a different user than the current reporter
    const items = page.locator('.custom-dropdown-item:not(.active)')
    await items.first().click()

    const newReporter = await reporterName.textContent()
    expect(newReporter).not.toBe(initialReporter)
    await expect(issueDetail(page).locator('.custom-dropdown')).not.toBeVisible()
  })

  test('editing issue title inline', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const titleText = page.locator('.issue-title-text')
    await titleText.click()

    const titleInput = page.locator('.issue-title-input')
    await expect(titleInput).toBeVisible()
    await titleInput.fill('Updated Title For Test')
    await titleInput.press('Enter')

    await expect(titleText).toBeVisible()
    await expect(titleText).toHaveText('Updated Title For Test')
  })

  test('delete issue via confirm dialog', async ({ page }) => {
    const totalBefore = await boardIssueCards(page).count()

    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    // Click trash button
    await page.locator('.issue-details-action-btn').nth(2).click()

    // Confirm dialog should appear
    await expect(page.locator('.confirm-dialog')).toBeVisible()
    await expect(page.locator('.confirm-dialog-title')).toContainText('Are you sure')

    // Click delete
    await page.locator('.confirm-dialog-actions button', { hasText: 'Delete issue' }).click()

    // Dialog should close and board should have one fewer card
    await expect(issueDetail(page).locator('[data-part="content"]')).not.toBeVisible({ timeout: 500 })
    // deleteIssue() is fire-and-forget — wait for the board to re-render
    await expect(boardIssueCards(page)).toHaveCount(totalBefore - 1, { timeout: 500 })
  })

  test('cancel delete keeps issue', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    await page.locator('.issue-details-action-btn').nth(2).click()
    await expect(page.locator('.confirm-dialog')).toBeVisible()

    await page.locator('.confirm-dialog-actions button', { hasText: 'Cancel' }).click()
    await expect(page.locator('.confirm-dialog')).not.toBeVisible()

    // Issue detail should still be open
    await expect(page.locator('.issue-details')).toBeVisible()
  })

  test('add a comment to an issue', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const commentsBefore = await page.locator('.comment').count()

    // Click the comment placeholder to open form
    await issueDetail(page).locator('.comment-create-fake').click()
    await expect(issueDetail(page).locator('.comment-create-form')).toBeVisible()

    await issueDetail(page).locator('.comment-create-form textarea').fill('Test comment from e2e')
    await issueDetail(page).locator('.comment-create-form button', { hasText: 'Save' }).click()

    // New comment should appear
    await expect(page.locator('.comment')).toHaveCount(commentsBefore + 1)
    await expect(issueDetail(page).locator('.comment-body').last()).toContainText('Test comment from e2e')
  })

  test('cancel comment form clears and closes', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    await issueDetail(page).locator('.comment-create-fake').click()
    await expect(issueDetail(page).locator('.comment-create-form')).toBeVisible()

    await issueDetail(page).locator('.comment-create-form textarea').fill('This will be cancelled')
    await issueDetail(page).locator('.comment-create-form button', { hasText: 'Cancel' }).click()

    await expect(issueDetail(page).locator('.comment-create-form')).not.toBeVisible()
    await expect(issueDetail(page).locator('.comment-create-fake')).toBeVisible()
  })

  test('"Recently Updated" filter toggles and filters', async ({ page }) => {
    const totalBefore = await boardIssueCards(page).count()

    await page.locator('.board-filters-button', { hasText: 'Recently Updated' }).click()
    await page.waitForTimeout(300)

    await expect(page.locator('.board-filters-button.active', { hasText: 'Recently Updated' })).toBeVisible()
    const totalFiltered = await boardIssueCards(page).count()
    expect(totalFiltered).toBeLessThanOrEqual(totalBefore)

    // Toggle off
    await page.locator('.board-filters-button', { hasText: 'Recently Updated' }).click()
    await page.waitForTimeout(300)
    const totalRestored = await boardIssueCards(page).count()
    expect(totalRestored).toBe(totalBefore)
  })

  test('"Clear all" button resets all filters', async ({ page }) => {
    const totalBefore = await boardIssueCards(page).count()

    // Apply multiple filters
    await page.locator('.board-filters-button', { hasText: 'Only My Issues' }).click()
    await page.waitForTimeout(300)

    // Clear all should appear
    await expect(page.locator('.board-filters-clear')).toBeVisible()
    await page.locator('.board-filters-clear').click()
    await page.waitForTimeout(300)

    // All cards restored
    const totalRestored = await boardIssueCards(page).count()
    expect(totalRestored).toBe(totalBefore)

    // Clear all link should be gone
    await expect(page.locator('.board-filters-clear')).not.toBeVisible()
  })

  test('close issue detail via close button', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    // Click close (X) button — last action button
    await page.locator('.issue-details-action-btn').last().click()
    await expect(issueDetail(page).locator('[data-part="content"]')).not.toBeVisible({ timeout: 500 })
  })

  test('original estimate input updates value', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const estimateInput = page.locator('.issue-details-field input[type="number"]').first()
    await estimateInput.fill('20')
    await estimateInput.dispatchEvent('change')

    await expect(estimateInput).toHaveValue('20')
  })

  test('changing original estimate updates time tracking remaining hours', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const estimateInput = page.locator('.issue-details-field input[type="number"]').first()
    const trackingValues = page.locator('.tracking-widget--clickable .tracking-values')

    // Read how much time is already logged for this issue
    const loggedText = await trackingValues.locator('span').first().textContent()
    const alreadySpent = parseInt(loggedText || '0', 10) || 0

    // Set estimate to 10 — remaining = max(0, 10 - alreadySpent)
    await estimateInput.fill('10')
    await estimateInput.dispatchEvent('change')
    const expectedRemaining10 = Math.max(0, 10 - alreadySpent)
    await expect(trackingValues).toContainText(`${expectedRemaining10}h remaining`)

    // Now change estimate to 20 — remaining = max(0, 20 - alreadySpent)
    await estimateInput.fill('20')
    await estimateInput.dispatchEvent('change')
    const expectedRemaining20 = Math.max(0, 20 - alreadySpent)
    await expect(trackingValues).toContainText(`${expectedRemaining20}h remaining`)

    // Verify logged time is unchanged
    await expect(trackingValues).toContainText(loggedText!)
  })

  test('changing estimate after logging time in dialog recalculates remaining', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const estimateInput = page.locator('.issue-details-field input[type="number"]').first()
    const trackingValues = page.locator('.tracking-widget--clickable .tracking-values')

    // Set a known estimate first
    await estimateInput.fill('10')
    await estimateInput.dispatchEvent('change')

    // Open tracking dialog, log 4h spent, save
    await page.locator('.tracking-widget--clickable').click()
    await expect(page.locator('.dialog-tracking [data-part="content"]')).toBeVisible()

    const spentInput = page.locator('.tracking-edit-field').first().locator('input')
    await spentInput.fill('4')
    await spentInput.dispatchEvent('input')
    await page.locator('.dialog-tracking button', { hasText: 'Done' }).click()
    await expect(page.locator('.dialog-tracking [data-part="content"]')).not.toBeVisible({ timeout: 2000 })

    // remaining = 10 - 4 = 6
    await expect(trackingValues).toContainText('4h logged')
    await expect(trackingValues).toContainText('6h remaining')

    // Now change estimate to 16 — remaining should become 16-4=12h
    await estimateInput.fill('16')
    await estimateInput.dispatchEvent('change')
    await expect(trackingValues).toContainText('12h remaining')
    await expect(trackingValues).toContainText('4h logged')
  })

  test('increasing time spent in dialog auto-decreases remaining', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    // Set a known estimate
    const estimateInput = page.locator('.issue-details-field input[type="number"]').first()
    await estimateInput.fill('10')
    await estimateInput.dispatchEvent('change')

    // Open tracking dialog
    await page.locator('.tracking-widget--clickable').click()
    await expect(page.locator('.dialog-tracking [data-part="content"]')).toBeVisible()

    const spentInput = page.locator('.tracking-edit-field').first().locator('input')
    const dialogValues = page.locator('.dialog-tracking .tracking-values')

    // Type 3 into spent — remaining should show 10-3=7
    await spentInput.fill('3')
    await spentInput.dispatchEvent('input')
    await expect(dialogValues).toContainText('7h remaining')

    // Type 8 into spent — remaining should show 10-8=2
    await spentInput.fill('8')
    await spentInput.dispatchEvent('input')
    await expect(dialogValues).toContainText('2h remaining')

    // Type 12 (over estimate) — remaining should clamp to 0
    await spentInput.fill('12')
    await spentInput.dispatchEvent('input')
    await expect(dialogValues).toContainText('0h remaining')

    // Save and verify the outer widget reflects the saved values
    await page.locator('.dialog-tracking button', { hasText: 'Done' }).click()
    await expect(page.locator('.dialog-tracking [data-part="content"]')).not.toBeVisible({ timeout: 2000 })

    const trackingValues = page.locator('.tracking-widget--clickable .tracking-values')
    await expect(trackingValues).toContainText('12h logged')
    await expect(trackingValues).toContainText('0h remaining')
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
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    await page.locator('.issue-type-clickable').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()

    // All 3 type options visible
    await expect(issueDetail(page).locator('.custom-dropdown-item')).toHaveCount(3)

    // Search for "bug"
    await issueDetail(page).locator('.custom-dropdown-search-input').fill('bug')
    await expect(issueDetail(page).locator('.custom-dropdown-item')).toHaveCount(1, { timeout: 2000 })
    await expect(issueDetail(page).locator('.custom-dropdown-item')).toContainText('Bug')

    // Clear search — all options back
    await issueDetail(page).locator('.custom-dropdown-search-input').fill('')
    await expect(issueDetail(page).locator('.custom-dropdown-item')).toHaveCount(3, { timeout: 2000 })
  })

  test.describe('DOM Stability', () => {
    test('surgical DOM updates: opening and closing issue detail preserves card DOM nodes', async ({ page }) => {
      // Mark the first .issue-card with a custom data attribute
      await page
        .locator('.issue-card')
        .first()
        .evaluate((el) => {
          el.setAttribute('data-stability-marker', 'survivor')
        })

      // Open issue detail dialog
      await boardIssueCards(page).first().click()
      await expect(issueDetail(page).locator('[data-part="content"]')).toBeVisible()

      // Close the dialog
      await page.locator('.issue-details-action-btn').last().click()
      await expect(issueDetail(page).locator('[data-part="content"]')).not.toBeVisible({ timeout: 500 })

      // The marker must survive — proves the DOM node was not recreated
      const marker = await page
        .locator('.issue-card')
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

  test.describe('Drag and Drop', () => {
    test('dragging a card to another column moves it without errors', async ({ page }) => {
      const errors: string[] = []
      page.on('pageerror', (err) => errors.push(err.message))

      const backlogCards = page.locator('.board-list').nth(0).locator('.issue-card')
      const selectedCards = page.locator('.board-list').nth(1).locator('.issue-card')

      const backlogCountBefore = await backlogCards.count()
      const selectedCountBefore = await selectedCards.count()
      expect(backlogCountBefore).toBeGreaterThan(0)

      const firstCard = backlogCards.first()
      const cardTitle = await firstCard.locator('.issue-card-title').textContent()

      const selectedDropZone = page.locator('.board-list').nth(1).locator('.board-list-issues')

      // Drag from backlog to selected column
      const cardBox = await firstCard.boundingBox()
      const dropBox = await selectedDropZone.boundingBox()

      await page.mouse.move(cardBox!.x + cardBox!.width / 2, cardBox!.y + cardBox!.height / 2)
      await page.mouse.down()
      // Move past drag threshold (5px)
      await page.mouse.move(cardBox!.x + cardBox!.width / 2 + 10, cardBox!.y + cardBox!.height / 2 + 10, { steps: 3 })
      // Move to the drop zone
      await page.mouse.move(dropBox!.x + dropBox!.width / 2, dropBox!.y + 20, { steps: 10 })
      await page.waitForTimeout(100)
      await page.mouse.up()

      // Wait for drop animation + reconciliation
      await page.waitForTimeout(500)

      // No ReferenceError should have occurred
      const stashErrors = errors.filter((e) => e.includes('stashComponentForTransfer'))
      expect(stashErrors).toEqual([])

      // Card should have moved: backlog has one fewer, selected has one more
      await expect(backlogCards).toHaveCount(backlogCountBefore - 1, { timeout: 1000 })
      await expect(selectedCards).toHaveCount(selectedCountBefore + 1, { timeout: 1000 })

      // The moved card should be in the selected column
      await expect(selectedCards.locator('.issue-card-title', { hasText: cardTitle! })).toBeVisible()

      // No placeholder should remain
      await expect(page.locator('.gea-dnd-placeholder')).toHaveCount(0)
    })
  })

  test('assignee add and remove', async ({ page }) => {
    await boardIssueCards(page).first().click()
    await expect(page.locator('.issue-details')).toBeVisible({ timeout: 500 })

    const chipsBefore = await page.locator('.assignee-chip').count()

    // Click "+ Add more"
    await page.locator('.assignee-add-more').click()
    await expect(issueDetail(page).locator('.custom-dropdown')).toBeVisible()

    // Add a user
    const availableUsers = issueDetail(page).locator('.custom-dropdown-item')
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
