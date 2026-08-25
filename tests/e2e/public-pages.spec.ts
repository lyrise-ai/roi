/**
 * Tests for the pages anyone can reach without signing in.
 * They check the feedback flow customers use after receiving a report.
 */
import { test, expect } from '@playwright/test'

// ── /roi-feedback ─────────────────────────────────────────────────────────────

test.describe('/roi-feedback', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/roi-feedback')
  })

  test('renders without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('shows Clarity rating question', async ({ page }) => {
    await expect(page.getByText('Clarity')).toBeVisible()
  })

  test('shows Relevance rating question', async ({ page }) => {
    await expect(page.getByText('Relevance')).toBeVisible()
  })

  test('rating buttons are clickable', async ({ page }) => {
    // Each question offers 1 to 5. Clicking one should not break anything.
    const ratingButtons = page
      .getByRole('button')
      .filter({ hasText: /^[1-5]$/ })
    const count = await ratingButtons.count()
    expect(count).toBeGreaterThan(0)
    await ratingButtons.first().click()
  })

  test('submit button exists', async ({ page }) => {
    await expect(page.getByRole('button', { name: /submit/i })).toBeVisible()
  })
})
