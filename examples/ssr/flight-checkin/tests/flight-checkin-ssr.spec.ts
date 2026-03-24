import { test, expect } from '@playwright/test'

test.describe('Flight Check-in (SSR)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    await page.waitForSelector('#app >> .flight-checkin', { timeout: 15000 })
  })

  // --- SSR-specific tests ---

  test('server renders initial HTML with Step 1 content', async ({ page }) => {
    const response = await page.request.get('/')
    expect(response.ok()).toBe(true)
    const html = await response.text()
    expect(html).toContain('Select Luggage')
    expect(html).toContain('Carry-on bag')
  })

  test('no console errors after hydration', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && !msg.text().includes('MIME type')) errors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForSelector('#app >> .flight-checkin', { timeout: 15000 })
    await page.waitForLoadState('networkidle')
    expect(errors).toEqual([])
  })

  // --- Full flow test ---

  test('completes full check-in flow: luggage → seat → meal → payment → boarding pass', async ({ page }) => {
    // Step 1: Luggage
    await expect(page.getByRole('heading', { name: 'Select Luggage' })).toBeVisible()
    await page.getByText('1 checked bag').nth(0).click()
    await page.locator('.nav-buttons .btn-primary').click()

    // Step 2: Seat
    await expect(page.getByRole('heading', { name: 'Select Seat' })).toBeVisible()
    await page.getByText('Economy Plus').nth(0).click()
    await page.locator('.nav-buttons .btn-primary').click()

    // Step 3: Meal
    await expect(page.getByRole('heading', { name: 'Select Meal' })).toBeVisible()
    await page.getByText('Chicken').nth(0).click()
    await page.locator('.nav-buttons .btn-primary:has-text("Review & Pay")').click()

    // Step 4: Payment
    await expect(page.getByRole('heading', { name: 'Review & Payment' })).toBeVisible()
    await page.getByPlaceholder('Passenger name').fill('Jane Smith')
    await page.getByPlaceholder(/Card number/).fill('4242424242424242')
    await page.getByPlaceholder('MM/YY').fill('1228')
    await page.locator('.payment-form .btn-primary:has-text("Pay")').click()

    // View Boarding Pass
    await page.locator('.nav-buttons .btn-primary:has-text("View Boarding Pass")').click()

    // Step 5: Boarding pass
    await expect(page.locator('.success-message')).toHaveText(/Check-in complete!/)
    await expect(page.locator('.confirmation-code')).toBeVisible()

    // New Check-in
    await page.getByRole('button', { name: 'New Check-in' }).click()
    await expect(page.getByRole('heading', { name: 'Select Luggage' })).toBeVisible()
  })

  test('back navigation preserves selections', async ({ page }) => {
    await page.getByText('2 checked bags').nth(0).click()
    await page.locator('.nav-buttons .btn-primary').click()
    await expect(page.getByRole('heading', { name: 'Select Seat' })).toBeVisible()

    await page.locator('.nav-buttons .btn-secondary').click()
    await expect(page.getByRole('heading', { name: 'Select Luggage' })).toBeVisible()
    await expect(page.getByText('2 checked bags').nth(0).locator('..').locator('..')).toHaveClass(/selected/)
  })

  test('payment form validation prevents invalid submit', async ({ page }) => {
    await page.locator('.nav-buttons .btn-primary').click()
    await page.locator('.nav-buttons .btn-primary').click()
    await page.locator('.nav-buttons .btn-primary:has-text("Review & Pay")').click()

    await expect(page.getByRole('heading', { name: 'Review & Payment' })).toBeVisible()

    const payButton = page.locator('.payment-form .btn-primary:has-text("Pay")')
    await expect(payButton).toBeDisabled()

    await page.getByPlaceholder('Passenger name').fill('A')
    await expect(payButton).toBeDisabled()

    await page.getByPlaceholder('Passenger name').fill('Jane Smith')
    await page.getByPlaceholder(/Card number/).fill('1234')
    await expect(payButton).toBeDisabled()

    await page.getByPlaceholder(/Card number/).fill('4242424242424242')
    await page.getByPlaceholder('MM/YY').fill('1228')
    await expect(payButton).toBeEnabled()
  })
})
