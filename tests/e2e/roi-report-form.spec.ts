/**
 * ROI report generator form tests — runs in the `authenticated` project.
 * Verifies step-1 intake behavior (input state, validation, industry
 * selection) without triggering actual AI generation or API costs. The full
 * generate → validate → view chain is covered separately by
 * golden-path.spec.ts (local-only, since it needs the dev-mock generation
 * path).
 */
import { test, expect } from '@playwright/test'

test.describe('ROI report form (authenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/roi-report')
    await expect(page).toHaveURL('/roi-report', { timeout: 15_000 })
  })

  test('loads without redirect and without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await expect(page).not.toHaveURL(/auth\/login/)
    await page.waitForLoadState('networkidle')
    expect(errors).toHaveLength(0)
  })

  test('company name starts blank in production', async ({ page }) => {
    // The IS_DEV preset (companyName: 'LyRise', etc.) only applies when
    // NODE_ENV==='development'. CI always runs against the production
    // build (npm start), so this is the one place we can assert the real,
    // deployed behavior — a self-serve visitor must not see LyRise's own
    // preset data pre-filled in their intake form.
    test.skip(!process.env.CI, 'preset only reliably absent in a prod build')
    await expect(page.getByPlaceholder('e.g. Acme Corp')).toHaveValue('')
  })

  test('required step-1 fields accept input and advance to step 2', async ({
    page,
  }) => {
    await page.getByPlaceholder('e.g. Acme Corp').fill('Acme Corp')
    await page.getByPlaceholder('e.g. acmecorp.com').fill('acmecorp.com')
    await page
      .getByPlaceholder(/e\.g\. B2B management consulting/i)
      .fill('B2B widget manufacturing')
    await expect(page.getByPlaceholder('e.g. Acme Corp')).toHaveValue(
      'Acme Corp',
    )

    await page.getByRole('button', { name: /continue/i }).click()
    await expect(page.getByText('Step 2 of 2')).toBeVisible()
  })

  test('validation blocks advancing when company name is empty', async ({
    page,
  }) => {
    const input = page.getByPlaceholder('e.g. Acme Corp')
    await input.fill('')
    await page.getByRole('button', { name: /continue/i }).click()
    // Still on step 1 — Continue was blocked, not just "input still visible"
    // (visible would be true on step 2 as well if a different field reused
    // the same placeholder, so assert the step indicator directly).
    await expect(page.getByText('Step 1 of 2')).toBeVisible()
    await expect(input).toBeVisible()
  })

  test('industry pill selection toggles active state and can be cleared', async ({
    page,
  }) => {
    const pill = page.getByText('Technology / SaaS', { exact: true })
    await expect(pill).not.toHaveClass(/bg-gray-900/)

    await pill.click()
    await expect(pill).toHaveClass(/bg-gray-900/)

    // Clicking an already-active pill deselects it (PillGroup's onChange
    // toggles rather than just re-selecting).
    await pill.click()
    await expect(pill).not.toHaveClass(/bg-gray-900/)
  })
})
