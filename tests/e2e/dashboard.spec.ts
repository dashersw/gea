import { test, expect } from '@playwright/test'

test.describe('dashboard components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.dashboard')).toBeVisible({ timeout: 10000 })
  })

  test('renders dashboard header with title and buttons', async ({ page }) => {
    await expect(page.locator('.dashboard-header h1')).toHaveText('Dashboard')
    await expect(page.locator('.dashboard-header')).toContainText('Welcome back')
    // Buttons
    await expect(page.getByText('Download Report')).toBeVisible()
    await expect(page.getByText('Create New')).toBeVisible()
    // Badge
    await expect(page.getByText('Live')).toBeVisible()
  })

  test('displays 4 stat cards with values', async ({ page }) => {
    const statCards = page.locator('.stat-card')
    await expect(statCards).toHaveCount(4)

    await expect(page.locator('.stat-value').first()).toContainText('$45,231.89')
    await expect(page.locator('.stat-label').first()).toHaveText('Total Revenue')
    await expect(page.locator('.stat-change.positive')).toHaveCount(4)
  })

  test('shows overview card with tabs', async ({ page }) => {
    // Tabs should be present
    await expect(page.getByRole('tab', { name: 'Revenue' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Orders' })).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Customers' })).toBeVisible()
    // Chart placeholder
    await expect(page.locator('.chart-placeholder')).toBeVisible()
  })

  test('shows progress bar for monthly target', async ({ page }) => {
    await expect(page.getByText('Monthly Target')).toBeVisible()
    await expect(page.getByText('On Track')).toBeVisible()
    // Progress element should exist
    await expect(page.locator('[role="progressbar"]')).toBeVisible()
  })

  test('shows 5 recent activity items', async ({ page }) => {
    const activities = page.locator('.activity-item')
    await expect(activities).toHaveCount(5)

    await expect(activities.first()).toContainText('Olivia Martin')
    await expect(activities.first()).toContainText('purchased Pro plan')
    await expect(activities.first().locator('.activity-time')).toHaveText('2 min ago')
  })

  test('shows 4 team members', async ({ page }) => {
    const members = page.locator('.team-member')
    await expect(members).toHaveCount(4)

    await expect(members.first().locator('.team-name')).toHaveText('Sofia Davis')
    await expect(members.first().locator('.team-role')).toHaveText('Engineering Lead')
  })

  test('shows skeleton loading state placeholders', async ({ page }) => {
    await expect(page.locator('.skeleton-group')).toBeVisible()
    // Skeleton components render as divs with animate-pulse class
    const skeletons = page.locator('.skeleton-group .animate-pulse')
    const count = await skeletons.count()
    expect(count).toBeGreaterThan(0)
  })

  test('avatar components render in activity and team sections', async ({ page }) => {
    // Avatars should render for activity items and team members
    const avatars = page.locator('[data-scope="avatar"]')
    const count = await avatars.count()
    // 5 activity + 4 team = 9 avatars
    expect(count).toBeGreaterThanOrEqual(9)
  })

  test('footer text is visible', async ({ page }) => {
    await expect(page.getByText('gea-ui Dashboard Example')).toBeVisible()
  })

  test.describe('DOM Stability', () => {
    test('no data-gea-compiled-child-root attributes in the DOM', async ({ page }) => {
      const count = await page.locator('[data-gea-compiled-child-root]').count()
      expect(count).toBe(0)
    })
  })
})
