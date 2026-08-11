/**
 * /v2 POC route (LYR-182, screens: LYR-183) — runs in the `anon` project.
 *
 * Three guarantees: the route is reachable without auth, flow state survives
 * all four steps (landing → company → interview → reveal) and going back, and
 * submitting the company form does not wait on the canned scan.
 */
import { test, expect } from '@playwright/test'

test.describe('/v2', () => {
  test('@smoke walks all four steps and carries state', async ({ page }) => {
    await page.goto('/v2')
    // Landing is out of the flow: one CTA, no step counter, no splash.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Tell us how your teams actually work.',
    )
    await expect(page.getByText(/Step \d of 4/)).toHaveCount(0)

    await page.getByRole('button', { name: 'Start with my company' }).click()
    await expect(page.getByText('Step 2 of 4')).toBeVisible()

    await page.getByLabel('Company name').fill('Harbourfield Legal')
    await page.getByLabel('Website').fill('harbourfield.com')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    // The canned scan takes ~2s; the interview must already be here.
    await expect(page.getByText('Step 3 of 4')).toBeVisible({ timeout: 1000 })

    // Back preserves what was typed rather than resetting the step.
    // `exact` throughout — the Sentry widget's "Share feedback" label contains
    // "back" (production build only), and Next's dev-tools button is named
    // "Open Next.js Dev Tools", which substring-matches "Next".
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByLabel('Website')).toHaveValue('harbourfield.com')
    await page.getByRole('button', { name: 'Next', exact: true }).click()

    await page.getByRole('textbox').first().fill('12')
    await page.getByRole('button', { name: 'See the number' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    await expect(page.getByText('Harbourfield Legal')).toBeVisible()
    await expect(page.getByText('Hours a week: 12')).toBeVisible()
  })
})
