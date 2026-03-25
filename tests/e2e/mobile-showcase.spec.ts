import { test, expect } from '@playwright/test'

test.describe('mobile-showcase views and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.home-content')).toBeVisible({ timeout: 15000 })
  })

  test('home view renders hero, cards, and component list', async ({ page }) => {
    await expect(page.locator('.home-title')).toHaveText('Gea Mobile')
    await expect(page.locator('.home-subtitle')).toContainText('Mobile components')

    // Should show 3 navigation cards
    await expect(page.locator('.home-card')).toHaveCount(3)
    await expect(page.locator('.home-card').nth(0)).toContainText('Feed')
    await expect(page.locator('.home-card').nth(1)).toContainText('Tabs')
    await expect(page.locator('.home-card').nth(2)).toContainText('Gestures')

    // Component info list
    await expect(page.locator('.home-info li')).toHaveCount(8)
  })

  test('nav bar shows "Gea Mobile" title on home', async ({ page }) => {
    await expect(page.locator('.nav-title').first()).toHaveText('Gea Mobile')
  })

  test('tapping Feed card navigates to feed view', async ({ page }) => {
    await page.locator('.home-card').nth(0).click()
    await expect(page.locator('.feed-scroll')).toBeVisible({ timeout: 5000 })
    // ViewManager keeps old view — use last() for current view's nav title
    await expect(page.locator('.nav-title').last()).toHaveText('Feed')
  })

  test('feed view loads initial items', async ({ page }) => {
    await page.locator('.home-card').nth(0).click()
    await expect(page.locator('.feed-scroll')).toBeVisible({ timeout: 5000 })

    // Should have loaded feed cards (initial load = 8 items)
    await expect(page.locator('.feed-card')).toHaveCount(8, { timeout: 5000 })

    // Each card should have author, title, and body
    const firstCard = page.locator('.feed-card').first()
    await expect(firstCard.locator('.feed-card-author')).not.toBeEmpty()
    await expect(firstCard.locator('.feed-card-title')).not.toBeEmpty()
    await expect(firstCard.locator('.feed-card-body')).not.toBeEmpty()
  })

  test('feed card avatars show author initial', async ({ page }) => {
    await page.locator('.home-card').nth(0).click()
    await expect(page.locator('.feed-card')).toHaveCount(8, { timeout: 5000 })

    // Avatar should show first letter of author
    const avatar = page.locator('.feed-card-avatar').first()
    const avatarText = await avatar.textContent()
    const author = await page.locator('.feed-card-author').first().textContent()
    expect(avatarText?.trim()).toBe(author?.charAt(0))
  })

  test('tapping Tabs card navigates to tabs view', async ({ page }) => {
    await page.locator('.home-card').nth(1).click()
    await expect(page.locator('tab-view')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.nav-title').last()).toHaveText('Tabs')
  })

  test('tabs view shows 3 tab items', async ({ page }) => {
    await page.locator('.home-card').nth(1).click()
    await expect(page.locator('tab-view')).toBeVisible({ timeout: 5000 })

    await expect(page.locator('tab-item')).toHaveCount(3)
    await expect(page.locator('tab-item').nth(0)).toHaveText('Photos')
    await expect(page.locator('tab-item').nth(1)).toHaveText('Messages')
    await expect(page.locator('tab-item').nth(2)).toHaveText('Settings')
  })

  test('tabs view shows photos tab by default with 9 photo items', async ({ page }) => {
    await page.locator('.home-card').nth(1).click()
    await expect(page.locator('tab-view')).toBeVisible({ timeout: 5000 })

    // Photos view should be visible by default
    await expect(page.locator('.photo-grid')).toBeVisible()
    await expect(page.locator('.photo-item')).toHaveCount(9)
  })

  test('switching tabs shows messages content', async ({ page }) => {
    await page.locator('.home-card').nth(1).click()
    await expect(page.locator('tab-view')).toBeVisible({ timeout: 5000 })

    // Switch to Messages tab
    await page.locator('tab-item', { hasText: 'Messages' }).click()
    await expect(page.locator('.message-list')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.message-item')).toHaveCount(4)
  })

  test('switching tabs shows settings content', async ({ page }) => {
    await page.locator('.home-card').nth(1).click()
    await expect(page.locator('tab-view')).toBeVisible({ timeout: 5000 })

    // Switch to Settings tab
    await page.locator('tab-item', { hasText: 'Settings' }).click()
    await expect(page.locator('.settings-list')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.settings-item')).toHaveCount(5)
  })

  test('messages tab shows 4 messages with avatars', async ({ page }) => {
    await page.locator('.home-card').nth(1).click()
    await expect(page.locator('tab-view')).toBeVisible({ timeout: 5000 })
    await page.locator('tab-item', { hasText: 'Messages' }).click()
    await expect(page.locator('.message-list')).toBeVisible({ timeout: 5000 })

    const messages = page.locator('.message-item')
    await expect(messages).toHaveCount(4)

    // First message should be from Armagan
    await expect(messages.first().locator('strong')).toHaveText('Armagan')
    await expect(messages.first().locator('.message-avatar')).toHaveText('A')
  })

  test('settings tab shows correct values', async ({ page }) => {
    await page.locator('.home-card').nth(1).click()
    await expect(page.locator('tab-view')).toBeVisible({ timeout: 5000 })
    await page.locator('tab-item', { hasText: 'Settings' }).click()
    await expect(page.locator('.settings-list')).toBeVisible({ timeout: 5000 })

    const items = page.locator('.settings-item')
    await expect(items).toHaveCount(5)
    await expect(items.nth(0).locator('.settings-value')).toHaveText('On')
    await expect(items.nth(1).locator('.settings-value')).toHaveText('Light')
    await expect(items.nth(4).locator('.settings-value')).toHaveText('1.0.0')
  })

  test('tapping Gestures card navigates to gestures view', async ({ page }) => {
    await page.locator('.home-card').nth(2).click()
    await expect(page.locator('.gesture-content')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.nav-title').last()).toHaveText('Gestures')
  })

  test('gesture view shows empty log initially', async ({ page }) => {
    await page.locator('.home-card').nth(2).click()
    await expect(page.locator('.gesture-content')).toBeVisible({ timeout: 5000 })

    // Should show "No gestures detected yet"
    await expect(page.locator('.gesture-log-empty')).toBeVisible()
    await expect(page.locator('.gesture-log-empty')).toHaveText('No gestures detected yet')

    // Gesture target area should be visible
    await expect(page.locator('.gesture-target')).toBeVisible()
    await expect(page.locator('.gesture-target-label')).toHaveText('Touch here')
  })

  // Regression: GestureView toggles between an empty placeholder and `.map()` on the same
  // container; incremental list updates plus the conditional branch can duplicate keyed rows
  // (same `data-gea-item-id` and duplicate `id` — invalid HTML).
  test('gesture log has at most one DOM node per list item (unique data-gea-item-id)', async ({ page }) => {
    await page.locator('.home-card').nth(2).click()
    await expect(page.locator('.gesture-content')).toBeVisible({ timeout: 5000 })

    const target = page.locator('.gesture-target')
    const log = page.locator('.gesture-log')

    for (let i = 0; i < 4; i++) {
      await target.click()
      await expect(log.locator('.gesture-log-entry').first()).toBeVisible({ timeout: 5000 })
    }

    const itemIds = await log
      .locator('.gesture-log-entry')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-gea-item-id')))
    const unique = new Set(itemIds)
    expect(unique.size).toBe(itemIds.length)

    const domIds = await log.locator('.gesture-log-entry').evaluateAll((els) => els.map((el) => el.id))
    const uniqueDomIds = new Set(domIds)
    expect(uniqueDomIds.size).toBe(domIds.length)
  })

  test('sidebar hint text is shown on home', async ({ page }) => {
    await expect(page.locator('.home-hint')).toContainText('Swipe from the right edge')
  })

  test.describe('DOM Stability', () => {
    test('navigating to a sub-view does not rebuild the home cards', async ({ page }) => {
      const firstCard = page.locator('.home-card').nth(0)
      await expect(firstCard).toBeVisible()

      // Mark the first card node
      await firstCard.evaluate((el) => {
        ;(el as any).__domStabilityMarker = true
      })

      // Navigate to Tabs view
      await page.locator('.home-card').nth(1).click()
      await expect(page.locator('tab-view')).toBeVisible({ timeout: 5000 })

      // ViewManager keeps old views in the DOM — verify the marker survived
      const markerSurvived = await page
        .locator('.home-card')
        .nth(0)
        .evaluate((el) => {
          return (el as any).__domStabilityMarker === true
        })
      expect(markerSurvived).toBe(true)
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      const count = await page.locator('[data-gea-compiled-child-root]').count()
      expect(count).toBe(0)
    })
  })
})
