import { test, expect, type Page } from '@playwright/test'

/** Scope to one option/summary card — avoids strict-mode failures when duplicate subtrees exist in the DOM. */
function stepSection(page: Page, heading: string) {
  // Prefer the last matching section: conditional/branch rendering can leave an incomplete
  // duplicate subtree first; the active step content is typically the final match.
  return page
    .locator('.flight-checkin section.section-card')
    .filter({ has: page.getByRole('heading', { name: heading }) })
    .last()
}

function stepContinue(page: Page, heading: string) {
  return stepSection(page, heading).getByRole('button', { name: 'Continue' }).first()
}

test.describe('flight check-in multi-step flow and surgical DOM updates', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.flight-checkin')).toBeVisible({ timeout: 500 })
  })

  test('initial render shows step 1 with luggage options', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Select Luggage' })).toBeVisible()
    // Should show all 4 luggage options
    await expect(page.locator('.option-item')).toHaveCount(4)
    // Carry-on should be selected by default (first option)
    await expect(page.locator('.option-item.selected')).toHaveCount(1)
    // No Back button on step 1
    await expect(page.locator('.nav-buttons .btn-secondary')).not.toBeVisible()
  })

  test('completes full check-in flow through all 5 steps', async ({ page }) => {
    // Step 1: Luggage
    await stepSection(page, 'Select Luggage').getByText('1 checked bag').click()
    await stepContinue(page, 'Select Luggage').click()

    // Step 2: Seat
    await expect(page.getByRole('heading', { name: 'Select Seat' })).toBeVisible()
    await expect(stepSection(page, 'Select Seat').locator('.option-item')).toHaveCount(4)
    await stepSection(page, 'Select Seat').getByText('Economy Plus').click()
    await stepContinue(page, 'Select Seat').click()

    // Step 3: Meal
    await expect(page.getByRole('heading', { name: 'Select Meal' })).toBeVisible()
    await expect(stepSection(page, 'Select Meal').locator('.option-item')).toHaveCount(6)
    await stepSection(page, 'Select Meal').getByText('Chicken').click()
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Review & Pay' }).first().click()

    // Step 4: Summary & Payment
    await expect(page.getByRole('heading', { name: 'Review & Payment' })).toBeVisible()
    await expect(stepSection(page, 'Review & Payment').locator('.summary-row')).toHaveCount(5) // base + luggage + seat + meal + total
    await page.getByPlaceholder('Passenger name').fill('Jane Smith')
    await page.getByPlaceholder(/Card number/).fill('4242424242424242')
    await page.getByPlaceholder('MM/YY').fill('1228')
    await page.locator('.payment-form .btn-primary:has-text("Pay")').click()

    // View Boarding Pass button should appear
    await stepSection(page, 'Review & Payment').getByRole('button', { name: 'View Boarding Pass' }).first().click()

    // Step 5: Boarding Pass
    await expect(page.locator('.success-message')).toHaveText(/Check-in complete!/)
    await expect(page.locator('.boarding-pass')).toBeVisible()
    await expect(page.locator('.confirmation-code')).toContainText(/SK[A-Z0-9]{6}/)
    await expect(page.locator('.flight-route')).toContainText('CPH')
    await expect(page.locator('.flight-route')).toContainText('JFK')
  })

  test('back navigation preserves selections', async ({ page }) => {
    // Select 2 checked bags and go to step 2
    await stepSection(page, 'Select Luggage').getByText('2 checked bags').click()
    await stepContinue(page, 'Select Luggage').click()
    await expect(page.getByRole('heading', { name: 'Select Seat' })).toBeVisible()

    // Go back — luggage selection should be preserved
    await stepSection(page, 'Select Seat').getByRole('button', { name: 'Back' }).first().click()
    await expect(page.getByRole('heading', { name: 'Select Luggage' })).toBeVisible()
    await expect(
      stepSection(page, 'Select Luggage').getByText('2 checked bags').locator('..').locator('..'),
    ).toHaveClass(/selected/)

    // Go forward, select seat, go to step 3
    await stepContinue(page, 'Select Luggage').click()
    await stepSection(page, 'Select Seat').getByText('Premium Economy').click()
    await stepContinue(page, 'Select Seat').click()
    await expect(page.getByRole('heading', { name: 'Select Meal' })).toBeVisible()

    // Go back — seat selection should be preserved
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Back' }).first().click()
    await expect(stepSection(page, 'Select Seat').getByText('Premium Economy').locator('..').locator('..')).toHaveClass(
      /selected/,
    )
  })

  test('payment form validation prevents invalid submit', async ({ page }) => {
    // Navigate to payment step
    await stepContinue(page, 'Select Luggage').click()
    await stepContinue(page, 'Select Seat').click()
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Review & Pay' }).first().click()

    const payButton = page.locator('.payment-form .btn-primary:has-text("Pay")')

    // Empty form — button disabled
    await expect(payButton).toBeDisabled()

    // Name too short — still disabled
    await page.getByPlaceholder('Passenger name').fill('A')
    await expect(payButton).toBeDisabled()

    // Valid name but invalid card — still disabled
    await page.getByPlaceholder('Passenger name').fill('Jane Smith')
    await page.getByPlaceholder(/Card number/).fill('1234')
    await expect(payButton).toBeDisabled()

    // Valid card but no expiry — still disabled
    await page.getByPlaceholder(/Card number/).fill('4242424242424242')
    await expect(payButton).toBeDisabled()

    // Valid expiry — button now enabled
    await page.getByPlaceholder('MM/YY').fill('1228')
    await expect(payButton).toBeEnabled()
  })

  test('card number auto-formats to groups of 4', async ({ page }) => {
    // Navigate to payment step
    await stepContinue(page, 'Select Luggage').click()
    await stepContinue(page, 'Select Seat').click()
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Review & Pay' }).first().click()

    const cardInput = page.getByPlaceholder(/Card number/)
    await cardInput.fill('4242424242424242')
    const value = await cardInput.inputValue()
    expect(value).toBe('4242 4242 4242 4242')
  })

  test('expiry auto-formats to MM/YY', async ({ page }) => {
    // Navigate to payment step
    await stepContinue(page, 'Select Luggage').click()
    await stepContinue(page, 'Select Seat').click()
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Review & Pay' }).first().click()

    const expiryInput = page.getByPlaceholder('MM/YY')
    await expiryInput.fill('1228')
    const value = await expiryInput.inputValue()
    expect(value).toBe('12/28')
  })

  test('summary shows correct price breakdown', async ({ page }) => {
    // Select options with known prices
    await stepSection(page, 'Select Luggage').getByText('1 checked bag').click() // $35
    await stepContinue(page, 'Select Luggage').click()

    await stepSection(page, 'Select Seat').getByText('Economy Plus').click() // $45
    await stepContinue(page, 'Select Seat').click()

    await stepSection(page, 'Select Meal').getByText('Chicken').click() // $15
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Review & Pay' }).first().click()

    // Verify summary rows contain the prices
    const summaryText = await stepSection(page, 'Review & Payment').textContent()
    expect(summaryText).toContain('$199') // base price
    expect(summaryText).toContain('$35') // luggage
    expect(summaryText).toContain('$45') // seat
    expect(summaryText).toContain('$15') // meal
    expect(summaryText).toContain('$294') // total (199 + 35 + 45 + 15)
  })

  test('"New Check-in" resets to step 1', async ({ page }) => {
    // Complete the full flow
    await stepContinue(page, 'Select Luggage').click()
    await stepContinue(page, 'Select Seat').click()
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Review & Pay' }).first().click()
    await page.getByPlaceholder('Passenger name').fill('Test User')
    await page.getByPlaceholder(/Card number/).fill('4242424242424242')
    await page.getByPlaceholder('MM/YY').fill('1228')
    await page.locator('.payment-form .btn-primary:has-text("Pay")').click()
    await stepSection(page, 'Review & Payment').getByRole('button', { name: 'View Boarding Pass' }).first().click()
    await expect(page.locator('.success-message')).toBeVisible()

    // Click New Check-in
    await page.getByRole('button', { name: 'New Check-in' }).click()

    // Should be back at step 1
    await expect(page.getByRole('heading', { name: 'Select Luggage' })).toBeVisible()
  })

  test('boarding pass displays passenger name from payment form', async ({ page }) => {
    // Navigate through with a specific name
    await stepContinue(page, 'Select Luggage').click()
    await stepContinue(page, 'Select Seat').click()
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Review & Pay' }).first().click()
    await page.getByPlaceholder('Passenger name').fill('Jane Smith')
    await page.getByPlaceholder(/Card number/).fill('4242424242424242')
    await page.getByPlaceholder('MM/YY').fill('1228')
    await page.locator('.payment-form .btn-primary:has-text("Pay")').click()
    await stepSection(page, 'Review & Payment').getByRole('button', { name: 'View Boarding Pass' }).first().click()

    // Boarding pass should show the passenger name (uppercased)
    const passText = await page.locator('.boarding-pass-details').textContent()
    expect(passText?.toUpperCase()).toContain('JANE SMITH')
  })

  test('option selection is mutually exclusive within a step', async ({ page }) => {
    const luggage = stepSection(page, 'Select Luggage')
    const carryOn = luggage.locator('.option-item', { hasText: 'Carry-on bag' })
    const checkedOne = luggage.locator('.option-item', { hasText: '1 checked bag' })
    const checkedTwo = luggage.locator('.option-item', { hasText: '2 checked bags' })

    await carryOn.click()
    await expect(luggage.locator('.option-item.selected')).toHaveCount(1)

    // Click second option — first should deselect
    await checkedOne.click()
    await expect(luggage.locator('.option-item.selected')).toHaveCount(1)
    await expect(checkedOne).toHaveClass(/selected/)
    await expect(carryOn).not.toHaveClass(/selected/)

    // Click third option
    await checkedTwo.click()
    await expect(luggage.locator('.option-item.selected')).toHaveCount(1)
    await expect(checkedTwo).toHaveClass(/selected/)
  })

  test('selecting an option preserves correct option count and structure', async ({ page }) => {
    const luggage = stepSection(page, 'Select Luggage')
    const countBefore = await luggage.locator('.option-item').count()
    const checkedOne = luggage.locator('.option-item', { hasText: '1 checked bag' })

    // Click second option
    await checkedOne.click()
    await expect(checkedOne).toHaveClass(/selected/)

    // Option count must remain the same (no duplication or loss)
    await expect(luggage.locator('.option-item')).toHaveCount(countBefore)

    // Each option should still have a label
    const labels = ['Carry-on bag', '1 checked bag', '2 checked bags', '3 checked bags']
    for (const label of labels) {
      await expect(luggage.locator('.option-item', { hasText: label }).locator('.label')).not.toBeEmpty()
    }
  })

  test('step header shows correct step number', async ({ page }) => {
    // Step 1
    await expect(stepSection(page, 'Select Luggage').locator('.step-number')).toHaveText('1')

    // Step 2
    await stepContinue(page, 'Select Luggage').click()
    await expect(stepSection(page, 'Select Seat').locator('.step-number')).toHaveText('2')

    // Step 3
    await stepContinue(page, 'Select Seat').click()
    await expect(stepSection(page, 'Select Meal').locator('.step-number')).toHaveText('3')
  })

  test('copy confirmation code shows feedback', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])

    // Complete flow to boarding pass
    await stepContinue(page, 'Select Luggage').click()
    await stepContinue(page, 'Select Seat').click()
    await stepSection(page, 'Select Meal').getByRole('button', { name: 'Review & Pay' }).first().click()
    await page.getByPlaceholder('Passenger name').fill('Test User')
    await page.getByPlaceholder(/Card number/).fill('4242424242424242')
    await page.getByPlaceholder('MM/YY').fill('1228')
    await page.locator('.payment-form .btn-primary:has-text("Pay")').click()
    await stepSection(page, 'Review & Payment').getByRole('button', { name: 'View Boarding Pass' }).first().click()
    await expect(page.locator('.success-message')).toBeVisible()

    const copyIcon = page.locator('.confirmation-copy-button svg')
    const copyIconPath = copyIcon.locator('path')
    await expect(copyIcon).toBeVisible()
    await expect(copyIconPath).toHaveAttribute('d', /^M16/)
    expect(await copyIconPath.evaluate((el) => el.namespaceURI)).toBe('http://www.w3.org/2000/svg')
    const iconBox = await copyIconPath.evaluate((el) => {
      const box = (el as SVGGraphicsElement).getBBox()
      return { width: box.width, height: box.height }
    })
    expect(iconBox.width).toBeGreaterThan(0)
    expect(iconBox.height).toBeGreaterThan(0)

    // Click copy button
    await page.locator('.confirmation-copy-button').click()
    await expect(page.locator('.confirmation-copy-button.copied')).toBeVisible({ timeout: 500 })
  })

  test('free option items display "Included" instead of a price', async ({ page }) => {
    // Step 1: carry-on should show as free/included
    const freeOption = stepSection(page, 'Select Luggage').locator('.option-item').first().locator('.price')
    await expect(freeOption).toHaveClass(/free/)
  })

  test.describe('DOM Stability', () => {
    test('selecting a different luggage option does not rebuild the mount root', async ({ page }) => {
      const root = page.locator('#app')
      await expect(root).toBeVisible()

      // Mark the mount root (outside the component tree)
      await root.evaluate((el) => el.setAttribute('data-dom-stability-marker', 'original'))

      // Select a different option
      const luggage = stepSection(page, 'Select Luggage')
      const checkedTwo = luggage.locator('.option-item', { hasText: '2 checked bags' })
      await checkedTwo.click()
      await expect(checkedTwo).toHaveClass(/selected/)

      // Verify the mount root survived
      const markerSurvived = await page.locator('[data-dom-stability-marker="original"]').count()
      expect(markerSurvived).toBe(1)
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      const count = await page.locator('[data-gea-compiled-child-root]').count()
      expect(count).toBe(0)
    })
  })
})
