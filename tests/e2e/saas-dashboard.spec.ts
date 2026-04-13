import { test, expect } from '@playwright/test'

test.describe('SaaS Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.shell', { timeout: 500 })
  })

  test.describe('Navigation', () => {
    test('starts on overview view', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
      await expect(page.locator('[data-view="overview"]')).toHaveClass(/active/)
    })

    test('navigates to Users view', async ({ page }) => {
      await page.locator('[data-view="users"]').click()
      await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()
      await expect(page.locator('[data-view="users"]')).toHaveClass(/active/)
      await expect(page.locator('.user-table')).toBeVisible()
    })

    test('navigates to Settings view', async ({ page }) => {
      await page.locator('[data-view="settings"]').click()
      await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(page.locator('[data-view="settings"]')).toHaveClass(/active/)
    })

    test('active nav item updates correctly when switching views', async ({ page }) => {
      await page.locator('[data-view="users"]').click()
      await expect(page.locator('[data-view="users"]')).toHaveClass(/active/)
      await expect(page.locator('[data-view="overview"]')).not.toHaveClass(/active/)

      await page.locator('[data-view="settings"]').click()
      await expect(page.locator('[data-view="settings"]')).toHaveClass(/active/)
      await expect(page.locator('[data-view="users"]')).not.toHaveClass(/active/)
    })
  })

  test.describe('Overview', () => {
    test('displays 4 stat cards', async ({ page }) => {
      const cards = page.locator('.stat-grid .stat-value')
      await expect(cards).toHaveCount(4)
    })

    test('shows performance chart bars', async ({ page }) => {
      await expect(page.locator('.chart-bar')).toHaveCount(7)
    })

    test('shows activity list', async ({ page }) => {
      const items = page.locator('.activity-item')
      await expect(items).toHaveCount(4)
    })
  })

  test.describe('Users - Search', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="users"]').click()
    })

    test('shows all 5 initial users', async ({ page }) => {
      await expect(page.locator('.user-row')).toHaveCount(5)
    })

    test('filters users by name', async ({ page }) => {
      const searchInput = page.locator('input.search-input')
      await searchInput.fill('sofia')
      await expect(page.locator('.user-row')).toHaveCount(1)
      await expect(page.locator('.user-name').first()).toContainText('Sofia')
    })

    test('filters users by email', async ({ page }) => {
      await page.locator('input.search-input').fill('@acme.com')
      const rows = page.locator('.user-row')
      await expect(rows).toHaveCount(5)
    })

    test('shows empty state when no matches', async ({ page }) => {
      await page.locator('input.search-input').fill('zzznomatch')
      await expect(page.locator('.user-row')).toHaveCount(0)
      await expect(page.locator('.empty-state')).toBeVisible()
    })

    test('clears search and restores all users', async ({ page }) => {
      await page.locator('input.search-input').fill('sofia')
      await expect(page.locator('.user-row')).toHaveCount(1)
      await page.locator('input.search-input').fill('')
      await expect(page.locator('.user-row')).toHaveCount(5)
    })
  })

  test.describe('Users - Add', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="users"]').click()
    })

    test('opens add user modal', async ({ page }) => {
      await page.getByRole('button', { name: 'Add User' }).click()
      await expect(page.locator('.modal-box')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Add Team Member' })).toBeVisible()
    })

    test('add button is disabled when fields are empty', async ({ page }) => {
      await page.getByRole('button', { name: 'Add User' }).click()
      const addBtn = page.locator('.modal-box button:has-text("Add Member")')
      await expect(addBtn).toBeDisabled()
    })

    test('add button enables when both fields filled', async ({ page }) => {
      await page.getByRole('button', { name: 'Add User' }).click()
      await page.getByPlaceholder('Jane Smith').fill('Test User')
      await page.getByPlaceholder('jane@acme.com').fill('test@acme.com')
      const addBtn = page.locator('.modal-box button:has-text("Add Member")')
      await expect(addBtn).toBeEnabled()
    })

    test('adds new user and updates table', async ({ page }) => {
      const initialCount = await page.locator('.user-row').count()
      await page.getByRole('button', { name: 'Add User' }).click()
      await page.getByPlaceholder('Jane Smith').fill('New Member')
      await page.getByPlaceholder('jane@acme.com').fill('new@acme.com')
      await page.locator('.modal-box button:has-text("Add Member")').click()
      await expect(page.locator('.modal-box')).not.toBeVisible()
      await expect(page.locator('.user-row')).toHaveCount(initialCount + 1)
      await expect(page.locator('.user-name').last()).toContainText('New Member')
    })

    test('closes modal on cancel', async ({ page }) => {
      await page.getByRole('button', { name: 'Add User' }).click()
      await page.locator('.modal-box button:has-text("Cancel")').click()
      await expect(page.locator('.modal-box')).not.toBeVisible()
    })

    test('closes modal on backdrop click', async ({ page }) => {
      await page.getByRole('button', { name: 'Add User' }).click()
      await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } })
      await expect(page.locator('.modal-box')).not.toBeVisible()
    })
  })

  test.describe('Users - Delete', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="users"]').click()
    })

    test('opens delete confirmation modal', async ({ page }) => {
      await page.locator('.user-row button:has-text("Remove")').first().click()
      await expect(page.locator('.modal-box')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Remove Member' })).toBeVisible()
    })

    test('deletes user and updates table', async ({ page }) => {
      const initialCount = await page.locator('.user-row').count()
      await page.locator('.user-row button:has-text("Remove")').first().click()
      await page.locator('.modal-box button:has-text("Remove")').last().click()
      await expect(page.locator('.user-row')).toHaveCount(initialCount - 1)
    })

    test('cancels delete and keeps user', async ({ page }) => {
      const initialCount = await page.locator('.user-row').count()
      await page.locator('.user-row button:has-text("Remove")').first().click()
      await page.locator('.modal-box button:has-text("Cancel")').click()
      await expect(page.locator('.modal-box')).not.toBeVisible()
      await expect(page.locator('.user-row')).toHaveCount(initialCount)
    })
  })

  test.describe('Users - Status Toggle', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="users"]').click()
    })

    test('clicking status dot toggles user status', async ({ page }) => {
      const firstDot = page.locator('.status-dot').first()
      const wasActive = await firstDot.evaluate((el) => el.classList.contains('active'))
      await firstDot.click()
      if (wasActive) {
        await expect(firstDot).toHaveClass(/inactive/)
      } else {
        await expect(firstDot).toHaveClass(/active/)
      }
    })
  })

  test.describe('Settings', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="settings"]').click()
    })

    test('shows notifications tab by default', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Email Notifications' })).toBeVisible()
    })

    test('switches to security tab', async ({ page }) => {
      await page.locator('button[data-value="security"]').click()
      await expect(page.getByRole('heading', { name: 'Account Security' })).toBeVisible()
    })

    test('switches to billing tab', async ({ page }) => {
      await page.locator('button[data-value="billing"]').click()
      await expect(page.getByRole('heading', { name: 'Billing & Plan' })).toBeVisible()
    })

    test('billing shows user count in progress bar', async ({ page }) => {
      await page.locator('button[data-value="billing"]').click()
      await expect(page.locator('.plan-usage')).toContainText('5 / 10 users')
    })

    test('billing plan usage updates after adding user', async ({ page }) => {
      await page.locator('[data-view="users"]').click()
      await page.getByRole('button', { name: 'Add User' }).click()
      await page.getByPlaceholder('Jane Smith').fill('Extra Person')
      await page.getByPlaceholder('jane@acme.com').fill('extra@acme.com')
      await page.locator('.modal-box button:has-text("Add Member")').click()

      await page.locator('[data-view="settings"]').click()
      await page.locator('button[data-value="billing"]').click()
      await expect(page.locator('.plan-usage')).toContainText('6 / 10 users')
    })
  })

  test.describe('Settings - Notification Switches', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="settings"]').click()
    })

    test('notification setting rows are visible', async ({ page }) => {
      const rows = page.locator('.setting-row')
      const count = await rows.count()
      expect(count).toBeGreaterThanOrEqual(3)
    })

    test('toggling a notification switch changes its state', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Email Notifications' })).toBeVisible()
      // Find the visible switch control using evaluate to avoid Tabs viewport issues
      const stateBefore = await page.evaluate(() => {
        const rows = document.querySelectorAll('.setting-row')
        for (const row of rows) {
          if (row.textContent?.includes('Product updates') && row.getBoundingClientRect().width > 0) {
            const ctrl = row.querySelector('.switch-control') as HTMLElement
            if (ctrl) {
              const state = ctrl.getAttribute('data-state')
              ctrl.click()
              return state
            }
          }
        }
        return null
      })
      expect(stateBefore).toBeTruthy()
      // Verify state changed
      const stateAfter = await page.evaluate(() => {
        const rows = document.querySelectorAll('.setting-row')
        for (const row of rows) {
          if (row.textContent?.includes('Product updates') && row.getBoundingClientRect().width > 0) {
            return row.querySelector('.switch-control')?.getAttribute('data-state')
          }
        }
        return null
      })
      expect(stateAfter).not.toBe(stateBefore)
    })
  })

  test.describe('Settings - Security', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="settings"]').click()
      await page.locator('button[data-value="security"]').click()
    })

    test('shows two-factor authentication toggle', async ({ page }) => {
      await expect(page.locator('text=Two-factor authentication')).toBeVisible()
    })

    test('shows change password button', async ({ page }) => {
      await expect(page.locator('button:has-text("Change Password")')).toBeVisible()
    })

    test('toggling 2FA switch changes state', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Account Security' })).toBeVisible()
      const stateBefore = await page.evaluate(() => {
        const rows = document.querySelectorAll('.setting-row')
        for (const row of rows) {
          if (row.textContent?.includes('Two-factor') && row.getBoundingClientRect().width > 0) {
            const ctrl = row.querySelector('.switch-control') as HTMLElement
            if (ctrl) {
              const state = ctrl.getAttribute('data-state')
              ctrl.click()
              return state
            }
          }
        }
        return null
      })
      expect(stateBefore).toBeTruthy()
      const stateAfter = await page.evaluate(() => {
        const rows = document.querySelectorAll('.setting-row')
        for (const row of rows) {
          if (row.textContent?.includes('Two-factor') && row.getBoundingClientRect().width > 0) {
            return row.querySelector('.switch-control')?.getAttribute('data-state')
          }
        }
        return null
      })
      expect(stateAfter).not.toBe(stateBefore)
    })
  })

  test.describe('Settings - Billing', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="settings"]').click()
      await page.locator('button[data-value="billing"]').click()
    })

    test('shows Pro Plan badge', async ({ page }) => {
      await expect(page.locator('text=Pro Plan')).toBeVisible()
    })

    test('shows manage subscription button', async ({ page }) => {
      await expect(page.locator('button:has-text("Manage Subscription")')).toBeVisible()
    })

    test('shows billing plan price', async ({ page }) => {
      await expect(page.locator('.plan-price')).toBeVisible()
    })
  })

  test.describe('Overview - Performance Tabs', () => {
    test('shows performance chart with tab triggers', async ({ page }) => {
      // Tabs component renders triggers with data-value attributes
      await expect(page.locator('[data-part="trigger"][data-value="users"]')).toBeVisible()
      await expect(page.locator('[data-part="trigger"][data-value="revenue"]')).toBeVisible()
      await expect(page.locator('[data-part="trigger"][data-value="churn"]')).toBeVisible()
    })

    test('switching performance tab keeps chart visible', async ({ page }) => {
      await page.locator('[data-part="trigger"][data-value="revenue"]').click()
      // Chart bars should still be visible
      await expect(page.locator('.chart-bar')).toHaveCount(7)
    })
  })

  test.describe('Users - Role Selection', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('[data-view="users"]').click()
    })

    test('user rows show role badges', async ({ page }) => {
      // Role is rendered as a Badge (span) inside the second td
      const roleCells = page.locator('.user-row td:nth-child(2) span')
      const count = await roleCells.count()
      expect(count).toBe(5)
      // Each should have a role text
      const roles = await roleCells.allTextContents()
      for (const role of roles) {
        expect(['admin', 'editor', 'viewer']).toContain(role)
      }
    })

    test('add user modal has role selector', async ({ page }) => {
      await page.getByRole('button', { name: 'Add User' }).click()
      await expect(page.locator('.modal-box')).toBeVisible()
      // Role selector should be present
      await expect(page.locator('.modal-box [data-part="trigger"]')).toBeVisible()
    })
  })

  test.describe('Navigation State', () => {
    test('overview stat values are numeric', async ({ page }) => {
      const values = await page.locator('.stat-value').allTextContents()
      for (const val of values) {
        // Values should contain numbers (may have $ or , formatting)
        expect(val.replace(/[$,]/g, '')).toMatch(/\d+/)
      }
    })

    test('activity items show timestamps', async ({ page }) => {
      const items = page.locator('.activity-item')
      const count = await items.count()
      expect(count).toBe(4)
      // Each item should have some text content
      for (let i = 0; i < count; i++) {
        const text = await items.nth(i).textContent()
        expect(text!.length).toBeGreaterThan(0)
      }
    })

    test('navigating away and back preserves view state', async ({ page }) => {
      await page.locator('[data-view="users"]').click()
      await expect(page.locator('.user-table')).toBeVisible()
      await page.locator('[data-view="overview"]').click()
      await page.locator('[data-view="users"]').click()
      await expect(page.locator('.user-table')).toBeVisible()
      await expect(page.locator('.user-row')).toHaveCount(5)
    })
  })

  test.describe('DOM Stability', () => {
    test('surgical DOM update: nav items survive view switching', async ({ page }) => {
      // Mark the Users nav item
      const usersNav = page.locator('[data-view="users"]')
      await expect(usersNav).toBeVisible()
      await usersNav.evaluate((el) => el.setAttribute('data-dom-stability-marker', 'original'))

      // Switch to Settings view
      await page.locator('[data-view="settings"]').click()
      await expect(page.getByRole('heading', { name: 'Email Notifications' })).toBeVisible()

      // Switch back to Users view
      await page.locator('[data-view="users"]').click()
      await expect(page.locator('.user-table')).toBeVisible()

      // The nav item marker should survive view switching
      const markerSurvived = await page.locator('[data-dom-stability-marker="original"]').count()
      expect(markerSurvived).toBe(1)
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      // Check across all views
      await page.locator('[data-view="users"]').click()
      await expect(page.locator('.user-table')).toBeVisible()

      const compiledChildRootCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-gea-compiled-child-root]').length
      })
      expect(compiledChildRootCount).toBe(0)
    })
  })
})
