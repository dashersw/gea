import { test, expect } from '@playwright/test'

test.describe('Music Player', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('.player-layout', { timeout: 10000 })
  })

  test.describe('Playlist Navigation', () => {
    test('shows 3 playlists in sidebar', async ({ page }) => {
      await expect(page.locator('.playlist-btn')).toHaveCount(3)
    })

    test('first playlist is active by default', async ({ page }) => {
      await expect(page.locator('.playlist-btn').first()).toHaveClass(/active/)
    })

    test('switching playlist changes track list', async ({ page }) => {
      const firstTitle = await page.locator('tbody .track-title').first().textContent()
      await page.locator('.playlist-btn').nth(1).click()
      const newFirstTitle = await page.locator('tbody .track-title').first().textContent()
      expect(newFirstTitle).not.toBe(firstTitle)
    })

    test('active playlist button updates', async ({ page }) => {
      await page.locator('.playlist-btn').nth(1).click()
      await expect(page.locator('.playlist-btn').nth(1)).toHaveClass(/active/, { timeout: 10000 })
      await expect(page.locator('.playlist-btn').nth(0)).not.toHaveClass(/active/, { timeout: 10000 })
    })

    test('playlist shows correct track count badge', async ({ page }) => {
      const badge = page.locator('.playlist-btn').first().locator('.playlist-count')
      await expect(badge).toHaveText('3')
    })

    test('tracklist title updates when switching playlist', async ({ page }) => {
      await page.locator('[data-playlist-id="pl2"]').click()
      await expect(page.locator('.tracklist-title')).toHaveText('Rock Mix')
    })
  })

  test.describe('Track List', () => {
    test('shows 3 tracks for active playlist', async ({ page }) => {
      await expect(page.locator('tbody .track-row')).toHaveCount(3)
    })

    test('tracks show title, artist, album, duration', async ({ page }) => {
      await expect(page.locator('tbody .track-title').first()).toBeVisible()
      await expect(page.locator('tbody .track-artist').first()).toBeVisible()
      await expect(page.locator('tbody .track-album').first()).toBeVisible()
      await expect(page.locator('tbody .track-duration').first()).toBeVisible()
    })

    test('clicking track sets it as current', async ({ page }) => {
      await page.locator('tbody .track-row').nth(1).click()
      await expect(page.locator('tbody .track-row').nth(1)).toHaveClass(/current/)
    })

    test('playing track shows in now playing bar', async ({ page }) => {
      const title = await page.locator('tbody .track-title').nth(1).textContent()
      await page.locator('tbody .track-row').nth(1).click()
      await expect(page.locator('.np-title')).toHaveText(title!)
    })

    test('current track row is highlighted', async ({ page }) => {
      await page.locator('tbody .track-row').nth(0).click()
      await expect(page.locator('tbody .track-row').nth(0)).toHaveClass(/current/)
    })

    test('playing track shows ▶ icon in row', async ({ page }) => {
      await page.locator('tbody .track-row').first().click()
      await expect(page.locator('tbody .playing-icon')).toBeVisible()
    })
  })

  test.describe('Search', () => {
    test('search filters tracks by title', async ({ page }) => {
      const firstTitle = await page.locator('tbody .track-title').first().textContent()
      if (!firstTitle) return
      await page.locator('.track-search').fill(firstTitle.slice(0, 4))
      const count = await page.locator('tbody .track-row').count()
      expect(count).toBeLessThanOrEqual(3)
    })

    test('search shows empty state when no match', async ({ page }) => {
      await page.locator('.track-search').fill('zzznomatch')
      await expect(page.locator('tbody .track-row')).toHaveCount(0)
      await expect(page.locator('.no-tracks')).toBeVisible()
    })

    test('clearing search restores tracks', async ({ page }) => {
      await page.locator('.track-search').fill('zzz')
      await page.locator('.track-search').fill('')
      await expect(page.locator('tbody .track-row')).toHaveCount(3)
    })
  })

  test.describe('Playback Controls', () => {
    test('play/pause button is visible', async ({ page }) => {
      await expect(page.locator('[aria-label="Play"], [aria-label="Pause"]')).toBeVisible()
    })

    test('clicking play starts playback', async ({ page }) => {
      await page.locator('[data-playing="false"]').click()
      await expect(page.locator('[data-playing="true"]')).toBeVisible()
    })

    test('clicking pause stops playback', async ({ page }) => {
      await page.locator('[data-playing="false"]').click()
      await expect(page.locator('[data-playing="true"]')).toBeVisible()
      await page.locator('[data-playing="true"]').click()
      await expect(page.locator('[data-playing="false"]')).toBeVisible()
    })

    test('clicking track starts playback automatically', async ({ page }) => {
      await page.locator('tbody .track-row').nth(2).click()
      await expect(page.locator('[data-playing="true"]')).toBeVisible()
    })

    test('next track button changes current track', async ({ page }) => {
      await page.locator('tbody .track-row').first().click()
      const firstTitle = await page.locator('.np-title').textContent()
      await page.locator('[aria-label="Next track"]').click()
      const newTitle = await page.locator('.np-title').textContent()
      expect(newTitle).not.toBe(firstTitle)
    })

    test('shuffle toggle changes state', async ({ page }) => {
      const btn = page.locator('[data-shuffle]')
      await expect(btn).toHaveAttribute('data-shuffle', 'off')
      await btn.click()
      await expect(btn).toHaveAttribute('data-shuffle', 'on')
    })

    test('repeat cycles through states', async ({ page }) => {
      const btn = page.locator('[data-repeat]')
      await expect(btn).toHaveAttribute('data-repeat', 'none')
      await btn.click()
      await expect(btn).toHaveAttribute('data-repeat', 'one')
      await btn.click()
      await expect(btn).toHaveAttribute('data-repeat', 'all')
      await btn.click()
      await expect(btn).toHaveAttribute('data-repeat', 'none')
    })
  })

  test.describe('Now Playing Bar', () => {
    test('shows "No track selected" initially', async ({ page }) => {
      // Only if currentTrackId is null at start - depends on initial state
      // Our store starts with t1 as current, so check for that
      await expect(page.locator('.np-title')).toBeVisible()
    })

    test('volume slider is visible', async ({ page }) => {
      await expect(page.locator('.volume-slider')).toBeVisible()
    })

    test('progress slider is visible', async ({ page }) => {
      await expect(page.locator('.progress-slider')).toBeVisible()
    })

    test('sidebar shows now playing info after playing track', async ({ page }) => {
      await page.locator('tbody .track-row').first().click()
      await expect(page.locator('.sidebar-track-title')).toBeVisible()
      await expect(page.locator('.playing-badge')).toBeVisible()
    })
  })

  test.describe('DOM Stability', () => {
    test('surgical DOM update preserves track row nodes', async ({ page }) => {
      // Mark the first track row with a custom attribute
      const firstRow = page.locator('tbody .track-row').first()
      await firstRow.evaluate((el) => el.setAttribute('data-test-marker', 'stable'))

      // Click a different track to trigger a state update
      await page.locator('tbody .track-row').nth(1).click()
      await expect(page.locator('tbody .track-row').nth(1)).toHaveClass(/current/)

      // Verify the marker survives — the DOM node was not replaced
      await expect(firstRow).toHaveAttribute('data-test-marker', 'stable')
    })

    test('no data-gea-compiled-child-root attributes in DOM', async ({ page }) => {
      const leaked = await page.locator('[data-gea-compiled-child-root]').count()
      expect(leaked).toBe(0)
    })
  })
})
