import { test, expect } from '@playwright/test'

test.describe('router-file-based: file-system routing via router.setPath()', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.app')).toBeVisible()
    await expect(page.locator('.nav')).toBeVisible()
  })

  test('initial render shows Home page with nav links', async ({ page }) => {
    await expect(page.locator('.view h1')).toHaveText('Home')
    const links = page.locator('.nav a')
    await expect(links).toHaveCount(4)
    await expect(page.locator('.nav a.active')).toHaveText('Home')
  })

  test('About page renders via file-based route', async ({ page }) => {
    await page.locator('.nav a', { hasText: 'About' }).click()
    await expect(page.locator('.view h1')).toHaveText('About')
    await expect(page.locator('.nav a.active')).toHaveText('About')
  })

  test('Blog listing page renders and shows posts', async ({ page }) => {
    await page.locator('.nav a', { hasText: 'Blog' }).click()
    await expect(page.locator('.view h1')).toHaveText('Blog')
    await expect(page.locator('.post-card')).toHaveCount(3)
  })

  test('Blog post detail renders via dynamic [slug] route', async ({ page }) => {
    await page.locator('.nav a', { hasText: 'Blog' }).click()
    await page.locator('.post-card', { hasText: 'File-Based Routing' }).click()
    await expect(page.locator('.view h1')).toHaveText('File-Based Routing in Gea')
    await expect(page.locator('.back-link')).toBeVisible()
  })

  test('back link from blog post returns to blog listing', async ({ page }) => {
    await page.goto('/blog/getting-started')
    await expect(page.locator('.view h1')).toHaveText('Getting Started with Gea')
    await page.locator('.back-link').click()
    await expect(page.locator('.view h1')).toHaveText('Blog')
  })

  test('Users listing shows all users', async ({ page }) => {
    await page.locator('.nav a', { hasText: 'Users' }).click()
    await expect(page.locator('.view h1')).toHaveText('Users')
    await expect(page.locator('.user-row')).toHaveCount(4)
  })

  test('User profile renders via dynamic [id] route', async ({ page }) => {
    await page.goto('/users/1')
    await expect(page.locator('.user-profile h1')).toHaveText('Alice')
    await expect(page.locator('.role-badge')).toHaveText('Engineer')
    await expect(page.locator('.avatar')).toHaveText('A')
  })

  test('clicking user row navigates to profile', async ({ page }) => {
    await page.locator('.nav a', { hasText: 'Users' }).click()
    await page.locator('.user-row', { hasText: 'Bob' }).click()
    await expect(page.locator('.user-profile h1')).toHaveText('Bob')
    await expect(page.locator('.role-badge')).toHaveText('Designer')
  })

  test('catch-all [...all] route renders 404 for unknown paths', async ({ page }) => {
    await page.goto('/does-not-exist')
    await expect(page.locator('.not-found')).toBeVisible()
    await expect(page.locator('.not-found h1')).toHaveText('404')
  })

  test('404 page shows the unmatched path', async ({ page }) => {
    await page.goto('/no/such/route')
    await expect(page.locator('.not-found code')).toContainText('/no/such/route')
  })

  test('Go Home link on 404 page navigates back to /', async ({ page }) => {
    await page.goto('/oops')
    await page.locator('.not-found a').click()
    await expect(page.locator('.view h1')).toHaveText('Home')
  })

  test('root layout persists across page navigations', async ({ page }) => {
    await page.locator('.app').evaluate((el) => el.setAttribute('data-layout-marker', 'root'))

    await page.locator('.nav a', { hasText: 'About' }).click()
    await expect(page.locator('.view h1')).toHaveText('About')
    await expect(page.locator('[data-layout-marker="root"]')).toHaveCount(1)

    await page.locator('.nav a', { hasText: 'Blog' }).click()
    await expect(page.locator('.view h1')).toHaveText('Blog')
    await expect(page.locator('[data-layout-marker="root"]')).toHaveCount(1)
  })

  test('direct URL navigation to nested route renders correct page', async ({ page }) => {
    await page.goto('/users/3')
    await expect(page.locator('.user-profile h1')).toHaveText('Charlie')
    await expect(page.locator('.role-badge')).toHaveText('PM')
    await expect(page.locator('.nav')).toBeVisible()
  })

  test('nav active class tracks current route correctly', async ({ page }) => {
    // On /, only Home is active
    await expect(page.locator('.nav a.active')).toHaveCount(1)
    await expect(page.locator('.nav a.active')).toHaveText('Home')

    // On /blog, Blog is active
    await page.goto('/blog')
    await expect(page.locator('.nav a.active')).toHaveText('Blog')

    // On /blog/getting-started, Blog is still active (isActive prefix match)
    await page.goto('/blog/getting-started')
    await expect(page.locator('.nav a.active')).toHaveText('Blog')

    // On /users/2, Users is active
    await page.goto('/users/2')
    await expect(page.locator('.nav a.active')).toHaveText('Users')
  })
})
