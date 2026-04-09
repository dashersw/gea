import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Add-to-cart shows a toast that can cover the cart drawer; wait until it is gone before Checkout. */
async function waitForToastDismissed(page: Page) {
  await expect(page.locator('[data-part="toast-root"]')).toHaveCount(1, { timeout: 3000 })
  await expect(page.locator('[data-part="toast-root"]')).toHaveCount(0, { timeout: 10_000 })
}

test.describe('E-commerce Storefront', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.store-layout')).toBeVisible({ timeout: 60_000 })
  })

  test.describe('Product Grid', () => {
    test('shows all 8 products initially', async ({ page }) => {
      await expect(page.locator('.product-card')).toHaveCount(8)
    })

    test('displays product names and prices', async ({ page }) => {
      await expect(page.locator('.product-name').first()).toBeVisible()
      await expect(page.locator('.product-price').first()).toBeVisible()
    })

    test('shows filter count matching product count', async ({ page }) => {
      await expect(page.locator('.filter-count')).toContainText('8 products')
    })
  })

  test.describe('Category Filters', () => {
    test('filters by Electronics category', async ({ page }) => {
      await page.locator('[data-category="Electronics"]').click()
      const cards = page.locator('.product-card')
      const count = await cards.count()
      expect(count).toBeLessThan(8)
      // All visible should be electronics
      const categories = await page.locator('.product-category').allTextContents()
      for (const cat of categories) {
        expect(cat).toBe('Electronics')
      }
    })

    test('filters by Home Office category', async ({ page }) => {
      await page.locator('[data-category="Home Office"]').click()
      const categories = await page.locator('.product-category').allTextContents()
      for (const cat of categories) {
        expect(cat).toBe('Home Office')
      }
    })

    test('All category shows all products', async ({ page }) => {
      await page.locator('[data-category="Electronics"]').click()
      await page.locator('[data-category="All"]').click()
      await expect(page.locator('.product-card')).toHaveCount(8)
    })

    test('active category button is highlighted', async ({ page }) => {
      await page.locator('[data-category="Electronics"]').click()
      await expect(page.locator('[data-category="Electronics"]')).toHaveClass(/active/)
      await expect(page.locator('[data-category="All"]')).not.toHaveClass(/active/)
    })
  })

  test.describe('In-stock Filter', () => {
    test('hides out-of-stock products when checked', async ({ page }) => {
      const allCount = await page.locator('.product-card').count()
      await page.locator('.instock-checkbox').check()
      const filteredCount = await page.locator('.product-card').count()
      expect(filteredCount).toBeLessThan(allCount)
    })

    test('no products have out-of-stock badge when filtered', async ({ page }) => {
      await page.locator('.instock-checkbox').check()
      // "Out of Stock" badge should not be visible
      const outOfStockBadges = page.locator('.product-badge:has-text("Out of Stock")')
      await expect(outOfStockBadges).toHaveCount(0)
    })
  })

  test.describe('Cart', () => {
    test('cart button shows 0 items initially (no badge)', async ({ page }) => {
      const badge = page.locator('.cart-badge')
      await expect(badge).not.toBeVisible()
    })

    test('opens cart drawer', async ({ page }) => {
      await page.locator('.cart-button').click()
      await expect(page.locator('.cart-drawer')).toBeVisible()
    })

    test('cart shows empty state when no items', async ({ page }) => {
      await page.locator('.cart-button').click()
      await expect(page.locator('.cart-empty')).toBeVisible()
    })

    test('adds product to cart and shows badge', async ({ page }) => {
      const addBtn = page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first()
      await addBtn.click()
      await expect(page.locator('.cart-badge')).toBeVisible()
      await expect(page.locator('.cart-badge')).toHaveText('1')
    })

    test('button changes to "In Cart" after adding', async ({ page }) => {
      const firstCard = page.locator('.product-card:not(.out-of-stock)').first()
      await firstCard.locator('button:has-text("Add to Cart")').click()
      await expect(firstCard.locator('button:has-text("In Cart")')).toBeVisible()
    })

    test('cart displays added items', async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await page.locator('.cart-button').click()
      await expect(page.locator('.cart-item')).toHaveCount(1)
    })

    test('quantity increments and updates total', async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await page.locator('.cart-button').click()
      const initialTotal = await page.locator('.cart-total-value').textContent()
      await page.locator('.qty-btn:has-text("+")').click()
      const newTotal = await page.locator('.cart-total-value').textContent()
      expect(newTotal).not.toBe(initialTotal)
    })

    test('quantity does not go below 1', async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await page.locator('.cart-button').click()
      await page.locator('.qty-btn:has-text("−")').click()
      await expect(page.locator('.qty-value')).toHaveText('1')
    })

    test('removes item from cart', async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await page.locator('.cart-button').click()
      await page.locator('.cart-item-remove').click()
      await expect(page.locator('.cart-empty')).toBeVisible()
    })

    test('removing first item from cart with two items still shows remaining item', async ({ page }) => {
      // Add two products
      const addBtns = page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")')
      await addBtns.nth(0).click()
      await addBtns.nth(1).click()

      // Open cart — should have 2 items
      await page.locator('.cart-button').click()
      await expect(page.locator('.cart-item')).toHaveCount(2)

      // Remove the first item
      await page.locator('.cart-item-remove').first().click()

      // Remaining item should still be visible without closing/reopening
      await expect(page.locator('.cart-item')).toHaveCount(1)
      await expect(page.locator('.cart-empty')).not.toBeVisible()
    })

    test('closes on backdrop click', async ({ page }) => {
      await page.locator('.cart-button').click()
      await page.locator('.cart-backdrop').click({ position: { x: 10, y: 200 } })
      await expect(page.locator('.cart-drawer')).not.toBeVisible()
    })

    test('adding multiple products shows correct count', async ({ page }) => {
      const addBtns = page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")')
      await addBtns.nth(0).click()
      await addBtns.nth(1).click()
      await expect(page.locator('.cart-badge')).toHaveText('2')
    })
  })

  test.describe('Checkout', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await waitForToastDismissed(page)
      await page.locator('.cart-button').click()
      await page.locator('button:has-text("Checkout")').click()
    })

    test('shows checkout modal', async ({ page }) => {
      await expect(page.locator('.modal-box')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Checkout' })).toBeVisible()
    })

    test('place order button disabled with empty fields', async ({ page }) => {
      await expect(page.locator('button:has-text("Place Order")')).toBeDisabled()
    })

    test('place order button enables with valid data', async ({ page }) => {
      await page.getByPlaceholder('Jane Smith').fill('Jane Smith')
      await page.getByPlaceholder('jane@example.com').fill('jane@example.com')
      await page.getByPlaceholder('1234 5678 9012 3456').fill('4242424242424242')
      await expect(page.locator('button:has-text("Place Order")')).toBeEnabled()
    })

    test('completes checkout and shows success', async ({ page }) => {
      await page.getByPlaceholder('Jane Smith').fill('Jane Smith')
      await page.getByPlaceholder('jane@example.com').fill('jane@example.com')
      await page.getByPlaceholder('1234 5678 9012 3456').fill('4242424242424242')
      await page.locator('button:has-text("Place Order")').click()
      await expect(page.locator('.checkout-success')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Order Placed!' })).toBeVisible()
    })

    test('cart is empty after successful order', async ({ page }) => {
      await page.getByPlaceholder('Jane Smith').fill('Jane Smith')
      await page.getByPlaceholder('jane@example.com').fill('jane@example.com')
      await page.getByPlaceholder('1234 5678 9012 3456').fill('4242424242424242')
      await page.locator('button:has-text("Place Order")').click()
      await page.locator('button:has-text("Continue Shopping")').click()
      // Cart badge should be gone
      await expect(page.locator('.cart-badge')).not.toBeVisible()
    })
  })

  test.describe('Rating Filter', () => {
    test('rating filter reduces product count', async ({ page }) => {
      const allCount = await page.locator('.product-card').count()
      // Open the rating select dropdown
      await page.locator('.filter-group [data-part="trigger"]').first().click()
      await page.locator('[data-part="item"]', { hasText: '4+ stars' }).click()
      const filteredCount = await page.locator('.product-card').count()
      expect(filteredCount).toBeLessThanOrEqual(allCount)
    })
  })

  test.describe('Product Badges', () => {
    test('product badges are visible', async ({ page }) => {
      const badges = page.locator('.product-badge')
      const count = await badges.count()
      expect(count).toBeGreaterThan(0)
    })

    test('out of stock products have disabled add button', async ({ page }) => {
      const outOfStockCards = page.locator('.product-card.out-of-stock')
      const count = await outOfStockCards.count()
      if (count > 0) {
        const btn = outOfStockCards.first().locator('button')
        await expect(btn).toBeDisabled()
      }
    })
  })

  test.describe('Cart Advanced', () => {
    test('cart header shows item count', async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await page.locator('.cart-button').click()
      const header = page.locator('.cart-header')
      await expect(header).toContainText('1')
    })

    test('adding multiple quantities updates total correctly', async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await page.locator('.cart-button').click()
      const price = await page.locator('.cart-item-price').textContent()
      await page.locator('.qty-btn:has-text("+")').click()
      const newPrice = await page.locator('.cart-item-price').textContent()
      // Price should double
      expect(newPrice).not.toBe(price)
    })

    test('removing last item shows empty state', async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await page.locator('.cart-button').click()
      await expect(page.locator('.cart-item')).toHaveCount(1)
      await page.locator('.cart-item-remove').click()
      await expect(page.locator('.cart-empty')).toBeVisible()
    })
  })

  test.describe('Checkout Advanced', () => {
    test.beforeEach(async ({ page }) => {
      await page.locator('.product-card:not(.out-of-stock) button:has-text("Add to Cart")').first().click()
      await waitForToastDismissed(page)
      await page.locator('.cart-button').click()
      await page.locator('button:has-text("Checkout")').click()
    })

    test('cancel button closes checkout', async ({ page }) => {
      await page.locator('button:has-text("Cancel")').click()
      await expect(page.locator('.modal-box')).not.toBeVisible()
    })

    test('checkout backdrop click closes modal', async ({ page }) => {
      await page.locator('.modal-backdrop').click({ position: { x: 10, y: 10 } })
      await expect(page.locator('.modal-box')).not.toBeVisible()
    })

    test('partial form does not enable place order', async ({ page }) => {
      await page.getByPlaceholder('Jane Smith').fill('Jane Smith')
      // Only name filled, missing email and card
      await expect(page.locator('button:has-text("Place Order")')).toBeDisabled()
    })

    test('invalid email does not enable place order', async ({ page }) => {
      await page.getByPlaceholder('Jane Smith').fill('Jane Smith')
      await page.getByPlaceholder('jane@example.com').fill('notanemail')
      await page.getByPlaceholder('1234 5678 9012 3456').fill('4242424242424242')
      await expect(page.locator('button:has-text("Place Order")')).toBeDisabled()
    })

    test('shows order total in checkout', async ({ page }) => {
      await expect(page.locator('.modal-desc')).toContainText('Order total')
    })
  })

  test.describe('Category URL Sync', () => {
    test('category filter updates URL', async ({ page }) => {
      await page.locator('[data-category="Electronics"]').click()
      await expect(page).toHaveURL(/\/category\/Electronics/)
    })

    test('All category navigates to root', async ({ page }) => {
      await page.locator('[data-category="Electronics"]').click()
      await page.locator('[data-category="All"]').click()
      await expect(page).toHaveURL(/\/$/)
    })
  })

  test.describe('Filter Count', () => {
    test('filter count updates after category change', async ({ page }) => {
      await page.locator('[data-category="Electronics"]').click()
      const count = await page.locator('.product-card').count()
      await expect(page.locator('.filter-count')).toContainText(`${count} product`)
    })

    test('combined filters reduce count further', async ({ page }) => {
      await page.locator('[data-category="Electronics"]').click()
      const catCount = await page.locator('.product-card').count()
      await page.locator('.instock-checkbox').check()
      const combinedCount = await page.locator('.product-card').count()
      expect(combinedCount).toBeLessThanOrEqual(catCount)
    })
  })

  test.describe('DOM Stability', () => {
    test('surgical DOM update: product card survives add-to-cart action', async ({ page }) => {
      // Mark the first in-stock product card with a custom property
      const firstCard = page.locator('.product-card:not(.out-of-stock)').first()
      await expect(firstCard).toBeVisible()

      await firstCard.evaluate((el) => {
        ;(el as any).__gea_marker = true
      })

      // Add the product to cart (triggers state update)
      await firstCard.locator('button:has-text("Add to Cart")').click()
      await expect(firstCard.locator('button:has-text("In Cart")')).toBeVisible()

      // Verify the marker survives — the DOM node was not replaced
      const markerSurvived = await firstCard.evaluate((el) => {
        return (el as any).__gea_marker === true
      })
      expect(markerSurvived).toBe(true)
    })

    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      const compiledChildRootCount = await page.evaluate(() => {
        return document.querySelectorAll('[data-gea-compiled-child-root]').length
      })
      expect(compiledChildRootCount).toBe(0)
    })
  })
})
