/**
 * The main-path test. Runs signed in, and only on a developer's machine.
 *
 * Every other test in this suite checks one piece: the form draws, the
 * dashboard draws, login draws. None of them join up into "does the actual
 * core loop work" — generate a report, land in the wizard, reach the report.
 * This test walks that whole chain for real, using the same fast fake-data
 * path we use to demo the flow without paying for real research and model
 * calls.
 *
 * That path only works when running in development mode. It is an escape hatch
 * for fake data, so it deliberately cannot be reached against the production
 * build that CI runs. Rather than loosen a real safety check for the
 * convenience of a test, this test is skipped in CI and runs when a developer
 * runs the suite locally against `npm run dev`.
 *
 * report-access.spec.ts covers the riskier access-control logic and DOES run in
 * CI, by creating report data directly instead of going through generation.
 */
import { test, expect } from '@playwright/test'
import { adminClient, deleteReport } from './utils/reportFixtures'

test.skip(
  !!process.env.CI,
  'dev-mock generation requires NODE_ENV=development — run locally against `npm run dev`',
)

let generatedReportId: string | undefined

test.afterEach(async () => {
  if (!generatedReportId) return
  await deleteReport(adminClient(), generatedReportId)
  generatedReportId = undefined
})

test('generate (mocked) → validate wizard → report view', async ({ page }) => {
  await page.goto('/roi-report')
  await expect(page).toHaveURL('/roi-report', { timeout: 15_000 })

  // Alpha accounts get an opening screen first, which clears itself after 8
  // seconds. We dismiss it straight away rather than hoping our timeouts
  // outlast it.
  const skipSplash = page.getByRole('button', { name: 'Skip →' })
  if (await skipSplash.isVisible().catch(() => false)) {
    await skipSplash.click()
  }

  const companyName = `E2E Golden Path ${Date.now()}`
  await page.getByPlaceholder('e.g. Acme Corp').fill(companyName)
  await page.getByRole('button', { name: /continue/i }).click()

  // Step 2: email and currency, whatever is not already filled in from the
  // session.
  const emailInput = page.getByPlaceholder(/work email/i)
  if (await emailInput.isVisible().catch(() => false)) {
    const existing = await emailInput.inputValue()
    if (!existing) await emailInput.fill(process.env.TEST_USER_EMAIL ?? '')
  }

  await page.getByRole('button', { name: /fast mock preview/i }).click()

  // Alpha accounts land on a "finished" screen and move on themselves, using
  // the "Open my Profit Map" button. Everyone else is redirected automatically
  // about 400ms after generation ends. Wait for whichever happens.
  const openButton = page.getByRole('button', { name: /open my profit map/i })
  try {
    await openButton.waitFor({ state: 'visible', timeout: 20_000 })
    await openButton.click()
  } catch {
    // non-alpha accounts skip straight to the auto-redirect below
  }

  // Generation redirects into the validation wizard (reports aren't
  // considered validated until that wizard completes or is skipped). The
  // wizard's overview shows the generated figures/workflows but not the
  // company name itself — that only appears on the final report view.
  await page.waitForURL(/\/report\/.+\/validate/, { timeout: 30_000 })
  await expect(
    page.getByRole('heading', { name: /AI Profit & Productivity Report/i }),
  ).toBeVisible({ timeout: 15_000 })

  const reportId = page.url().match(/\/report\/([^/]+)\/validate/)?.[1]
  expect(reportId).toBeTruthy()
  generatedReportId = reportId

  // Employees (and bulk-outbound reports) get a "Skip validation →" escape
  // hatch straight to the report view — take it when available so this test
  // reaches the actual report render; otherwise stop here, since scripting
  // the full multi-step wizard blindly would be brittle relative to what it
  // buys.
  const skipButton = page.getByRole('button', { name: /skip validation/i })
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click()
    await page.waitForURL(new RegExp(`/report/${reportId}$`), {
      timeout: 15_000,
    })
    await expect(page.getByText(companyName)).toBeVisible({ timeout: 15_000 })
  }
})
