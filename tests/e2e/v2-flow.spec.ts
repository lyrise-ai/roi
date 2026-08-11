/**
 * /v2 POC route (LYR-182) — runs in the `anon` project.
 *
 * Two guarantees: the route is reachable without auth, and flow state survives
 * all four steps (landing → company → interview → reveal) and going back.
 */
import { test, expect } from '@playwright/test'

test.describe('/v2', () => {
  test('@smoke walks all four steps and carries state', async ({ page }) => {
    await page.goto('/v2')
    await expect(page.getByText('Step 1 of 4')).toBeVisible()

    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.getByLabel('Company website').fill('acme.com')
    await page.getByRole('button', { name: 'Scan' }).click()

    await page.getByRole('textbox').first().fill('12')
    await page.getByRole('button', { name: 'See the number' }).click()

    await expect(page.getByText('Step 4 of 4')).toBeVisible()
    await expect(page.getByText('acme.com')).toBeVisible()
    await expect(page.getByText('Hours a week: 12')).toBeVisible()

    // Back preserves what was typed rather than resetting the step.
    // `exact` — the Sentry widget's "Share feedback" label contains "back",
    // and it only mounts in the production build CI runs against.
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(page.getByLabel('Company website')).toHaveValue('acme.com')
  })
})
