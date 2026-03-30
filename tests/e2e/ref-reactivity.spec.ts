import { test, expect } from '@playwright/test'

test.describe('issue #34: ref reactivity after refresh', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.input-section')).toBeVisible()
  })

  test('ref={this.myTextarea} is assigned on initial page load', async ({ page }) => {
    // The textarea ref should be assigned — clicking Send with empty input
    // should trigger pulseCssClass which adds the 'error' class
    const textarea = page.locator('.textarea')
    const sendBtn = page.locator('.send-btn')

    await expect(textarea).toBeVisible()
    await expect(sendBtn).toBeVisible()

    // Click Send with empty textarea — if ref is null, trySubmit returns early
    // and no class is added. If ref works, pulseCssClass adds 'error' class.
    await sendBtn.click()
    await expect(textarea).toHaveClass(/error/)
  })

  test('ref={this.myTextarea} works after typing and submitting', async ({ page }) => {
    const textarea = page.locator('.textarea')
    const sendBtn = page.locator('.send-btn')

    // Type valid text and submit — should add 'success' class and clear value
    await textarea.fill('hello')
    await sendBtn.click()
    await expect(textarea).toHaveClass(/success/)
    await expect(textarea).toHaveValue('')
  })

  test('ref={this.myTextarea} is NOT null after page refresh', async ({ page }) => {
    const textarea = page.locator('.textarea')
    const sendBtn = page.locator('.send-btn')

    // Verify it works before refresh
    await sendBtn.click()
    await expect(textarea).toHaveClass(/error/)

    // Full page refresh — the core bug in issue #34
    await page.reload()
    await expect(page.locator('.input-section')).toBeVisible()

    // After refresh, ref must still be assigned
    const freshTextarea = page.locator('.textarea')
    const freshBtn = page.locator('.send-btn')

    await freshBtn.click()
    await expect(freshTextarea).toHaveClass(/error/, {
      timeout: 2000,
    })
  })

  test('ref survives multiple consecutive refreshes', async ({ page }) => {
    const sendBtn = page.locator('.send-btn')
    const textarea = page.locator('.textarea')

    // Refresh three times in a row
    for (let i = 0; i < 3; i++) {
      await page.reload()
      await expect(page.locator('.input-section')).toBeVisible()
    }

    // After three refreshes, ref should still work
    await sendBtn.click()
    await expect(textarea).toHaveClass(/error/, {
      timeout: 2000,
    })
  })

  test('textarea receives focus when Send is clicked (proves ref is live DOM element)', async ({ page }) => {
    const textarea = page.locator('.textarea')
    const sendBtn = page.locator('.send-btn')

    await sendBtn.click()

    // trySubmit calls this.myTextarea.focus() — if ref is null this won't happen
    await expect(textarea).toBeFocused()
  })

  test('textarea receives focus after refresh (proves ref survives reload)', async ({ page }) => {
    await page.reload()
    await expect(page.locator('.input-section')).toBeVisible()

    const textarea = page.locator('.textarea')
    const sendBtn = page.locator('.send-btn')

    await sendBtn.click()
    await expect(textarea).toBeFocused({ timeout: 2000 })
  })

  test('full submit flow works after refresh: type, send, clear', async ({ page }) => {
    await page.reload()
    await expect(page.locator('.input-section')).toBeVisible()

    const textarea = page.locator('.textarea')
    const sendBtn = page.locator('.send-btn')

    // Type valid text, submit — should add 'success' class and clear
    await textarea.fill('test message')
    await sendBtn.click()
    await expect(textarea).toHaveClass(/success/, { timeout: 2000 })
    await expect(textarea).toHaveValue('')
  })
})
