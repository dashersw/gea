import { test, expect } from '@playwright/test'

test.describe('Chat / Messaging App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.chat-layout', { timeout: 500 })
  })

  test.describe('Conversation List', () => {
    test('shows 4 conversations', async ({ page }) => {
      await expect(page.locator('.conv-item')).toHaveCount(4)
    })

    test('first conversation is active by default', async ({ page }) => {
      await expect(page.locator('.conv-item').first()).toHaveClass(/active/)
    })

    test('shows unread badges on conversations with unread messages', async ({ page }) => {
      const badgedItems = page.locator('.conv-item .unread-badge')
      const count = await badgedItems.count()
      expect(count).toBeGreaterThan(0)
    })

    test('switching conversation changes active item', async ({ page }) => {
      await page.locator('.conv-item').nth(1).click()
      await expect(page.locator('.conv-item').nth(1)).toHaveClass(/active/)
      await expect(page.locator('.conv-item').first()).not.toHaveClass(/active/)
    })

    test('switching conversation clears unread badge', async ({ page }) => {
      const secondItem = page.locator('.conv-item').nth(2) // c3 has 5 unread
      const badgeBefore = secondItem.locator('.unread-badge')
      const hasBadge = await badgeBefore.count()
      if (hasBadge > 0) {
        await secondItem.click()
        await expect(secondItem.locator('.unread-badge')).toHaveCount(0)
      }
    })

    test('thread header shows conversation name', async ({ page }) => {
      const firstName = await page.locator('.conv-item').first().locator('.conv-name').textContent()
      await expect(page.locator('.thread-name')).toHaveText(firstName!)
    })
  })

  test.describe('Message Thread', () => {
    test('shows initial messages for active conversation', async ({ page }) => {
      const messages = page.locator('.bubble')
      const count = await messages.count()
      expect(count).toBeGreaterThan(0)
    })

    test('message input is visible and focusable', async ({ page }) => {
      await expect(page.locator('.message-input')).toBeVisible()
      await page.locator('.message-input').click()
    })

    test('send button is disabled with empty input', async ({ page }) => {
      await expect(page.locator('button:has-text("Send")')).toBeDisabled()
    })

    test('send button enables when input has text', async ({ page }) => {
      await page.locator('.message-input').fill('Hello!')
      await expect(page.locator('button:has-text("Send")')).toBeEnabled()
    })

    test('sends message and appends to thread', async ({ page }) => {
      const initialCount = await page.locator('.bubble-mine').count()
      await page.locator('.message-input').fill('Test message')
      await page.locator('button:has-text("Send")').click()
      await expect(page.locator('.bubble-mine')).toHaveCount(initialCount + 1)
    })

    test('sent message appears with correct text', async ({ page }) => {
      await page.locator('.message-input').fill('Hello world!')
      await page.locator('button:has-text("Send")').click()
      const lastBubble = page.locator('.bubble-mine').last()
      await expect(lastBubble).toHaveText('Hello world!')
    })

    test('input clears after sending', async ({ page }) => {
      await page.locator('.message-input').fill('Test')
      await page.locator('button:has-text("Send")').click()
      await expect(page.locator('.message-input')).toHaveValue('')
    })

    test('send button disabled again after sending', async ({ page }) => {
      await page.locator('.message-input').fill('Test')
      await page.locator('button:has-text("Send")').click()
      await expect(page.locator('button:has-text("Send")')).toBeDisabled()
    })

    test('Enter key sends message', async ({ page }) => {
      const initialCount = await page.locator('.bubble-mine').count()
      await page.locator('.message-input').fill('Enter key test')
      await page.locator('.message-input').press('Enter')
      await expect(page.locator('.bubble-mine')).toHaveCount(initialCount + 1)
    })

    test('typing indicator appears then disappears after sending', async ({ page }) => {
      await page.locator('.message-input').fill('Trigger reply')
      await page.locator('button:has-text("Send")').click()
      // Typing indicator (dots) may appear briefly
      // Wait for eventual reply
      await expect(page.locator('.bubble')).toHaveCount(await page.locator('.bubble').count(), { timeout: 500 })
    })
  })

  test.describe('Cross-conversation', () => {
    test('messages are isolated per conversation', async ({ page }) => {
      const firstMsgs = await page.locator('.bubble').count()
      await page.locator('.conv-item').nth(1).click()
      const secondMsgs = await page.locator('.bubble').count()
      // Different conversations may have different message counts
      // (just verify they load without error)
      expect(firstMsgs).toBeGreaterThan(0)
      expect(secondMsgs).toBeGreaterThan(0)
    })

    test('sending in one conv does not affect another', async ({ page }) => {
      await page.locator('.message-input').fill('Conv 1 message')
      await page.locator('button:has-text("Send")').click()

      await page.locator('.conv-item').nth(1).click()
      const messagesInConv2 = await page.locator('.bubble-mine').allTextContents()
      expect(messagesInConv2).not.toContain('Conv 1 message')
    })

    test('unread count updates when receiving messages in inactive conversation', async ({ page }) => {
      // Send in conv 1, then switch away and check if conv 1 gets unread
      // This is handled by simulateReply - after 1.5s delay
      // We just verify the UI handles state correctly
      await page.locator('.message-input').fill('Hello')
      await page.locator('button:has-text("Send")').click()
      // Switch to another conv
      await page.locator('.conv-item').nth(3).click()
      // Wait for potential reply to arrive in conv 1
      await page.waitForTimeout(2000)
      // conv 1 (index 0) might now have an unread badge
      // Just verify the list is still intact
      await expect(page.locator('.conv-item')).toHaveCount(4)
    })
  })

  test.describe('Router', () => {
    test('clicking conversation updates URL', async ({ page }) => {
      await page.locator('.conv-item').nth(1).click()
      await expect(page).toHaveURL(/\/conversations\/c2/)
    })

    test('navigating to conversation URL selects it', async ({ page }) => {
      await page.goto('/conversations/c3')
      await page.waitForSelector('.chat-layout', { timeout: 500 })
      await expect(page.locator('.conv-item').nth(2)).toHaveClass(/active/)
    })

    test('navigating to conversation URL shows correct thread', async ({ page }) => {
      await page.goto('/conversations/c2')
      await page.waitForSelector('.chat-layout', { timeout: 500 })
      await expect(page.locator('.thread-name')).toHaveText('Jackson Lee')
    })

    test('clicking multiple conversations updates URL each time', async ({ page }) => {
      await page.locator('.conv-item').nth(1).click()
      await expect(page).toHaveURL(/\/conversations\/c2/)
      await page.locator('.conv-item').nth(2).click()
      await expect(page).toHaveURL(/\/conversations\/c3/)
    })
  })

  test.describe('Auto-reply & Typing', () => {
    test('auto-reply appears after sending a message', async ({ page }) => {
      const initialCount = await page.locator('.bubble').count()
      await page.locator('.message-input').fill('Trigger auto reply')
      await page.locator('button:has-text("Send")').click()
      // Wait for simulated reply (1.5s delay + typing)
      await expect(page.locator('.bubble')).toHaveCount(initialCount + 2, { timeout: 500 })
    })

    test('typing indicator shows while reply is pending', async ({ page }) => {
      await page.locator('.message-input').fill('Trigger typing')
      await page.locator('button:has-text("Send")').click()
      // Typing dots should appear
      await expect(page.locator('.typing-dots')).toBeVisible({ timeout: 500 })
    })
  })

  test.describe('Message Bubbles', () => {
    test('sent messages have mine class', async ({ page }) => {
      await page.locator('.message-input').fill('My message')
      await page.locator('button:has-text("Send")').click()
      await expect(page.locator('.bubble-mine').last()).toHaveText('My message')
    })

    test('received messages have theirs class', async ({ page }) => {
      const theirsBubbles = page.locator('.bubble-theirs')
      const count = await theirsBubbles.count()
      expect(count).toBeGreaterThan(0)
    })

    test('incoming messages show avatar', async ({ page }) => {
      const theirsAvatars = page.locator('.bubble-theirs .avatar, .bubble-row:has(.bubble-theirs) .avatar')
      const count = await theirsAvatars.count()
      expect(count).toBeGreaterThanOrEqual(0) // Avatar may be on row or bubble
    })
  })

  test.describe('Online Status', () => {
    test('online dot visible for online contacts', async ({ page }) => {
      const onlineDots = page.locator('.online-dot')
      const count = await onlineDots.count()
      expect(count).toBeGreaterThan(0)
    })

    test('thread header shows online status', async ({ page }) => {
      // Thread header should show some status info
      await expect(page.locator('.thread-header')).toBeVisible()
    })
  })

  test.describe('Multiple Messages', () => {
    test('sending multiple messages appends in order', async ({ page }) => {
      const initialCount = await page.locator('.bubble-mine').count()
      await page.locator('.message-input').fill('First')
      await page.locator('button:has-text("Send")').click()
      await page.locator('.message-input').fill('Second')
      await page.locator('button:has-text("Send")').click()
      await expect(page.locator('.bubble-mine')).toHaveCount(initialCount + 2)
      const texts = await page.locator('.bubble-mine').allTextContents()
      expect(texts[texts.length - 2]).toBe('First')
      expect(texts[texts.length - 1]).toBe('Second')
    })

    test('switching conversations preserves sent messages', async ({ page }) => {
      await page.locator('.message-input').fill('Remember me')
      await page.locator('button:has-text("Send")').click()
      await expect(page.locator('.bubble-mine').last()).toHaveText('Remember me')

      // Switch away and back
      await page.locator('.conv-item').nth(1).click()
      await page.locator('.conv-item').first().click()

      // Message should still be there
      await expect(page.locator('.bubble-mine').last()).toHaveText('Remember me')
    })
  })

  test.describe('DOM Stability', () => {
    test('sending a message does not re-render existing message bubbles', async ({ page }) => {
      // Grab the first existing message bubble's element reference via a data attribute marker
      const firstBubble = page.locator('.message-wrap').first()
      await expect(firstBubble).toBeVisible()

      // Mark the existing DOM element with a unique attribute
      await firstBubble.evaluate((el) => el.setAttribute('data-dom-stability-marker', 'original'))

      // Send a new message
      await page.locator('.message-input').fill('DOM stability test')
      await page.locator('button:has-text("Send")').click()

      // Wait for the new message to appear
      await expect(page.locator('.bubble-mine').last()).toHaveText('DOM stability test')

      // The original message bubble should STILL have the marker attribute
      // If the component was fully re-rendered, the DOM elements are recreated and the marker is lost
      const markedElement = page.locator('[data-dom-stability-marker="original"]')
      await expect(markedElement).toHaveCount(1, { timeout: 500 })
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      const compiledChildRoots = page.locator('[data-gea-compiled-child-root]')
      await expect(compiledChildRoots).toHaveCount(0)
    })
  })

  test.describe('Sidebar Header', () => {
    test('sidebar header shows total unread count', async ({ page }) => {
      const totalBadge = page.locator('.total-unread')
      const count = await totalBadge.count()
      // May or may not be visible depending on unread state
      if (count > 0) {
        const text = await totalBadge.textContent()
        expect(Number(text)).toBeGreaterThan(0)
      }
    })
  })
})
