import { test, expect } from '@playwright/test'

test.describe('forms settings page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.settings-page')).toBeVisible({ timeout: 500 })
  })

  test('renders settings header', async ({ page }) => {
    await expect(page.locator('.settings-header h1')).toHaveText('Settings')
    await expect(page.locator('.settings-header p')).toContainText('Manage your account')
  })

  test('profile section has input fields', async ({ page }) => {
    await expect(page.getByText('Profile')).toBeVisible()
    // Input fields by placeholder (exact match)
    await expect(page.getByPlaceholder('John', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('Doe', { exact: true })).toBeVisible()
    await expect(page.getByPlaceholder('john@example.com')).toBeVisible()
    // Textarea for bio
    await expect(page.locator('textarea')).toBeVisible()
  })

  test('profile inputs accept text', async ({ page }) => {
    await page.getByPlaceholder('John', { exact: true }).fill('Jane')
    await expect(page.getByPlaceholder('John', { exact: true })).toHaveValue('Jane')

    await page.getByPlaceholder('Doe', { exact: true }).fill('Smith')
    await expect(page.getByPlaceholder('Doe', { exact: true })).toHaveValue('Smith')
  })

  test('preferences section has language select', async ({ page }) => {
    await expect(page.getByText('Language', { exact: true })).toBeVisible()
    // Select trigger should be present
    await expect(page.locator('[data-scope="select"]').first()).toBeVisible()
  })

  test('preferences section has theme radio group', async ({ page }) => {
    await expect(page.getByText('Theme')).toBeVisible()
    // Radio items: Light, Dark, System
    await expect(page.getByText('Light')).toBeVisible()
    await expect(page.getByText('Dark')).toBeVisible()
    await expect(page.getByText('System')).toBeVisible()
  })

  test('notification switches are visible', async ({ page }) => {
    await expect(page.getByText('Email Notifications')).toBeVisible()
    await expect(page.getByText('Marketing Emails')).toBeVisible()
    await expect(page.getByText('Push Notifications')).toBeVisible()

    // Switch components should exist
    const switches = page.locator('[data-scope="switch"]')
    const count = await switches.count()
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('checkbox fields are visible', async ({ page }) => {
    await expect(page.getByText('Terms of Service')).toBeVisible()
    await expect(page.getByText('weekly newsletter')).toBeVisible()
  })

  test('accessibility section has slider and number inputs', async ({ page }) => {
    await expect(page.getByText('Font Size')).toBeVisible()
    await expect(page.getByText('Line Height')).toBeVisible()
    await expect(page.getByText('Tab Size')).toBeVisible()

    // Slider should exist
    await expect(page.getByRole('slider', { name: 'Font Size' })).toBeVisible()
    // NumberInput root elements (not sub-parts)
    const numberInputRoots = page.locator('[data-scope="number-input"][data-part="root"]')
    await expect(numberInputRoots).toHaveCount(2)
  })

  test('security section has PIN input and tags input', async ({ page }) => {
    await expect(page.getByText('Two-Factor Code')).toBeVisible()
    await expect(page.getByText('Trusted IP Addresses')).toBeVisible()

    // PinInput should have inputs (6 visible + 1 hidden)
    const pinInputs = page.locator('[data-scope="pin-input"] input')
    await expect(pinInputs).toHaveCount(7)

    // TagsInput should show default values
    await expect(page.getByText('192.168.1.1')).toBeVisible()
    await expect(page.getByText('10.0.0.1')).toBeVisible()
  })

  test('tags input delete removes a tag', async ({ page }) => {
    await expect(page.getByText('192.168.1.1')).toBeVisible()

    const deleteBtn = page.locator('[data-scope="tags-input"] [data-part="item-delete-trigger"]').first()
    await deleteBtn.click()

    await expect(
      page.locator('[data-scope="tags-input"] [data-part="item-preview"]', { hasText: '192.168.1.1' }),
    ).toHaveCount(0)
    await expect(page.getByText('10.0.0.1')).toBeVisible()
  })

  test('documents section has file upload', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible()
    // FileUpload component should exist
    await expect(page.locator('[data-scope="file-upload"][data-part="root"]')).toBeAttached()
  })

  test('action buttons are visible', async ({ page }) => {
    await expect(page.locator('.form-actions')).toBeVisible()
    await expect(page.getByText('Cancel')).toBeVisible()
    await expect(page.getByText('Save Changes')).toBeVisible()
  })

  test.describe('DOM Stability', () => {
    test('typing in an input field does not rebuild the form section', async ({ page }) => {
      const input = page.getByPlaceholder('John', { exact: true })
      await expect(input).toBeVisible()

      // Mark the input's parent section with a custom property
      await input.evaluate((el) => {
        const section = el.closest('.settings-section') || el.parentElement!
        ;(section as any).__domStabilityMarker = true
      })

      // Type into the input
      await input.fill('TestName')
      await expect(input).toHaveValue('TestName')

      // Verify the marker survived — the DOM node was not replaced
      const markerSurvived = await input.evaluate((el) => {
        const section = el.closest('.settings-section') || el.parentElement!
        return (section as any).__domStabilityMarker === true
      })
      expect(markerSurvived).toBe(true)
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      const count = await page.locator('[data-gea-compiled-child-root]').count()
      expect(count).toBe(0)
    })
  })
})
