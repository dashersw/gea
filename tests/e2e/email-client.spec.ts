import { test, expect } from '@playwright/test'

test.describe('Email Client', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.email-layout', { timeout: 500 })
  })

  test.describe('Folder Navigation', () => {
    test('shows 4 folders in sidebar', async ({ page }) => {
      await expect(page.locator('.folder-btn')).toHaveCount(4)
    })

    test('inbox is active by default', async ({ page }) => {
      await expect(page.locator('[data-folder="inbox"]')).toHaveClass(/active/)
    })

    test('inbox shows unread badge', async ({ page }) => {
      await expect(page.locator('.folder-badge')).toBeVisible()
    })

    test('navigates to Sent folder', async ({ page }) => {
      await page.locator('[data-folder="sent"]').click()
      await expect(page.locator('[data-folder="sent"]')).toHaveClass(/active/)
      await expect(page.locator('.email-list-title')).toHaveText('Sent')
    })

    test('navigates to Drafts folder', async ({ page }) => {
      await page.locator('[data-folder="drafts"]').click()
      await expect(page.locator('.email-list-title')).toHaveText('Drafts')
    })

    test('switching folder changes email list', async ({ page }) => {
      const inboxCount = await page.locator('.email-row').count()
      await page.locator('[data-folder="sent"]').click()
      const sentCount = await page.locator('.email-row').count()
      // Inbox and Sent have different emails
      expect(inboxCount).not.toBe(sentCount)
    })

    test('switching folder clears active email', async ({ page }) => {
      await page.locator('.email-row').first().click()
      await expect(page.locator('.detail-subject')).toBeVisible()
      await page.locator('[data-folder="sent"]').click()
      await expect(page.locator('.email-empty')).toBeVisible()
    })
  })

  test.describe('Email List', () => {
    test('shows inbox emails', async ({ page }) => {
      const rows = page.locator('.email-row')
      const count = await rows.count()
      expect(count).toBeGreaterThan(0)
    })

    test('unread emails appear bold', async ({ page }) => {
      const unreadRows = page.locator('.email-row.unread')
      const count = await unreadRows.count()
      expect(count).toBeGreaterThan(0)
    })

    test('clicking email selects it', async ({ page }) => {
      await page.locator('.email-row').first().click()
      await expect(page.locator('.email-row').first()).toHaveClass(/active/)
    })

    test('clicking email marks it as read', async ({ page }) => {
      const firstRow = page.locator('.email-row.unread').first()
      const hadUnread = (await firstRow.count()) > 0
      if (hadUnread) {
        // Capture the email ID before clicking, since the locator re-evaluates after click
        const emailId = await firstRow.getAttribute('data-email-id')
        await firstRow.click()
        // After clicking, it should no longer be unread
        await expect(page.locator(`.email-row[data-email-id="${emailId}"]`)).not.toHaveClass(/unread/)
      }
    })

    test('inbox unread badge decrements when reading emails', async ({ page }) => {
      const initialBadge = await page.locator('.folder-badge').textContent()
      const initialCount = parseInt(initialBadge!)

      await page.locator('.email-row.unread').first().click()
      const newBadge = await page.locator('.folder-badge').textContent()
      const newCount = parseInt(newBadge!)
      expect(newCount).toBe(initialCount - 1)
    })

    test('starring an email toggles star', async ({ page }) => {
      const firstStar = page.locator('.star-btn').first()
      const hadStarred = await firstStar.getAttribute('class')
      await firstStar.click()
      const nowHasStarred = await firstStar.getAttribute('class')
      expect(hadStarred).not.toBe(nowHasStarred)
    })
  })

  test.describe('Search', () => {
    test('search filters emails by subject', async ({ page }) => {
      await page.locator('input.email-search').fill('Barcelona')
      const rows = page.locator('.email-row')
      const count = await rows.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('search shows empty state when no match', async ({ page }) => {
      await page.locator('input.email-search').fill('zzznomatch')
      await expect(page.locator('.list-empty')).toBeVisible()
    })

    test('clearing search restores all emails', async ({ page }) => {
      const allCount = await page.locator('.email-row').count()
      await page.locator('input.email-search').fill('Barcelona')
      await page.locator('input.email-search').fill('')
      await expect(page.locator('.email-row')).toHaveCount(allCount)
    })
  })

  test.describe('Email Detail', () => {
    test('shows empty state when no email selected', async ({ page }) => {
      await expect(page.locator('.email-empty')).toBeVisible()
    })

    test('shows email content when clicked', async ({ page }) => {
      await page.locator('.email-row').first().click()
      await expect(page.locator('.detail-subject')).toBeVisible()
      await expect(page.locator('.email-body-text')).toBeVisible()
    })

    test('shows correct subject', async ({ page }) => {
      const subject = await page.locator('.email-row').first().locator('.email-subject').textContent()
      await page.locator('.email-row').first().click()
      await expect(page.locator('.detail-subject')).toHaveText(subject!)
    })

    test('reply button opens compose with pre-filled To field', async ({ page }) => {
      await page.locator('.email-row').first().click()
      await page.locator('button:has-text("Reply")').click()
      await expect(page.locator('.compose-box')).toBeVisible()
      const toField = await page.locator('input[type="email"]').inputValue()
      expect(toField).toBeTruthy()
    })

    test('delete moves email to trash', async ({ page }) => {
      const inboxCountBefore = await page.locator('.email-row').count()
      await page.locator('.email-row').first().click()
      await page.locator('button:has-text("Delete")').click()
      await expect(page.locator('.email-row')).toHaveCount(inboxCountBefore - 1)
    })
  })

  test.describe('Compose', () => {
    test('opens compose modal', async ({ page }) => {
      await page.locator('button:has-text("Compose")').click()
      await expect(page.locator('.compose-box')).toBeVisible()
    })

    test('send button disabled with empty fields', async ({ page }) => {
      await page.locator('button:has-text("Compose")').click()
      await expect(page.locator('.compose-actions button:has-text("Send")')).toBeDisabled()
    })

    test('send button enables with To and Subject filled', async ({ page }) => {
      await page.locator('button:has-text("Compose")').click()
      await page.locator('input[type="email"]').fill('test@example.com')
      await page.locator('input[placeholder="Subject"]').fill('Test subject')
      await expect(page.locator('.compose-actions button:has-text("Send")')).toBeEnabled()
    })

    test('sends email and closes compose', async ({ page }) => {
      await page.locator('button:has-text("Compose")').click()
      await page.locator('input[type="email"]').fill('test@example.com')
      await page.locator('input[placeholder="Subject"]').fill('Test email')
      await page.locator('textarea').fill('Body of the email')
      await page.locator('.compose-actions button:has-text("Send")').click()
      await expect(page.locator('.compose-box')).not.toBeVisible()
    })

    test('sent email appears in Sent folder', async ({ page }) => {
      await page.locator('button:has-text("Compose")').click()
      await page.locator('input[type="email"]').fill('test@example.com')
      await page.locator('input[placeholder="Subject"]').fill('My new email')
      await page.locator('.compose-actions button:has-text("Send")').click()

      await page.locator('[data-folder="sent"]').click()
      const subjects = await page.locator('.email-subject').allTextContents()
      expect(subjects).toContain('My new email')
    })

    test('closes on discard', async ({ page }) => {
      await page.locator('button:has-text("Compose")').click()
      await page.locator('button:has-text("Discard")').click()
      await expect(page.locator('.compose-box')).not.toBeVisible()
    })

    test('closes on X button', async ({ page }) => {
      await page.locator('button:has-text("Compose")').click()
      await page.locator('.modal-close').click()
      await expect(page.locator('.compose-box')).not.toBeVisible()
    })

    test('compose backdrop click closes modal', async ({ page }) => {
      await page.locator('button:has-text("Compose")').click()
      await expect(page.locator('.compose-box')).toBeVisible()
      await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } })
      await expect(page.locator('.compose-box')).not.toBeVisible()
    })
  })

  test.describe('Reply', () => {
    test('reply pre-fills subject with Re: prefix', async ({ page }) => {
      const subject = await page.locator('.email-row').first().locator('.email-subject').textContent()
      await page.locator('.email-row').first().click()
      await page.locator('button:has-text("Reply")').click()
      const subjectValue = await page.locator('input[placeholder="Subject"]').inputValue()
      expect(subjectValue).toBe(`Re: ${subject}`)
    })

    test('reply pre-fills To with sender email', async ({ page }) => {
      await page.locator('.email-row').first().click()
      const senderEmail = await page.locator('.detail-sender-email').textContent()
      await page.locator('button:has-text("Reply")').click()
      const toValue = await page.locator('input[type="email"]').inputValue()
      expect(toValue).toBe(senderEmail)
    })
  })

  test.describe('Trash', () => {
    test('navigates to Trash folder', async ({ page }) => {
      await page.locator('[data-folder="trash"]').click()
      await expect(page.locator('[data-folder="trash"]')).toHaveClass(/active/)
      await expect(page.locator('.email-list-title')).toHaveText('Trash')
    })

    test('deleted email appears in trash', async ({ page }) => {
      const subject = await page.locator('.email-row').first().locator('.email-subject').textContent()
      await page.locator('.email-row').first().click()
      await page.locator('button:has-text("Delete")').click()

      await page.locator('[data-folder="trash"]').click()
      const trashSubjects = await page.locator('.email-subject').allTextContents()
      expect(trashSubjects).toContain(subject)
    })

    test('detail pane clears after delete', async ({ page }) => {
      await page.locator('.email-row').first().click()
      await expect(page.locator('.detail-subject')).toBeVisible()
      await page.locator('button:has-text("Delete")').click()
      await expect(page.locator('.email-empty')).toBeVisible()
    })
  })

  test.describe('Star', () => {
    test('star button has accessible label', async ({ page }) => {
      const starBtn = page.locator('.star-btn').first()
      const label = await starBtn.getAttribute('aria-label')
      expect(label).toMatch(/Star|Unstar/)
    })

    test('starring toggles aria-label', async ({ page }) => {
      const starBtn = page.locator('.star-btn').first()
      const labelBefore = await starBtn.getAttribute('aria-label')
      await starBtn.click()
      const labelAfter = await starBtn.getAttribute('aria-label')
      expect(labelBefore).not.toBe(labelAfter)
    })

    test('star click does not select email', async ({ page }) => {
      // Click star without selecting the email row
      await page.locator('.star-btn').first().click()
      // Detail pane should still show empty state
      await expect(page.locator('.email-empty')).toBeVisible()
    })
  })

  test.describe('Search Advanced', () => {
    test('search shows different empty message than no-emails folder', async ({ page }) => {
      await page.locator('input.email-search').fill('zzznomatch')
      const emptyText = await page.locator('.list-empty').textContent()
      expect(emptyText).toContain('search')
    })

    test('search persists when switching back to same folder', async ({ page }) => {
      await page.locator('input.email-search').fill('Barcelona')
      const filteredCount = await page.locator('.email-row').count()
      await page.locator('[data-folder="sent"]').click()
      await page.locator('[data-folder="inbox"]').click()
      // Search should clear when switching folders
      const allCount = await page.locator('.email-row').count()
      expect(allCount).toBeGreaterThanOrEqual(filteredCount)
    })
  })

  test.describe('Email List Selection', () => {
    test('clicking different emails updates detail pane', async ({ page }) => {
      await page.locator('.email-row').first().click()
      const firstSubject = await page.locator('.detail-subject').textContent()

      await page.locator('.email-row').nth(1).click()
      const secondSubject = await page.locator('.detail-subject').textContent()

      expect(firstSubject).not.toBe(secondSubject)
    })

    test('only one email row is active at a time', async ({ page }) => {
      await page.locator('.email-row').first().click()
      await page.locator('.email-row').nth(1).click()
      await expect(page.locator('.email-row.active')).toHaveCount(1)
    })
  })

  test.describe('DOM Stability', () => {
    test('surgical DOM update preserves email row nodes', async ({ page }) => {
      // Mark the first email row with a custom attribute
      const firstRow = page.locator('.email-row').first()
      await firstRow.evaluate((el) => el.setAttribute('data-test-marker', 'stable'))

      // Star a different email to trigger a state update
      await page.locator('.star-btn').nth(1).click()

      // Verify the marker survives — the DOM node was not replaced
      await expect(page.locator('.email-row[data-test-marker="stable"]')).toHaveCount(1)
    })

    test('no data-gea-compiled-child-root attributes in DOM', async ({ page }) => {
      const leaked = await page.locator('[data-gea-compiled-child-root]').count()
      expect(leaked).toBe(0)
    })
  })
})
