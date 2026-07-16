/**
 * Golden-path test — runs in the `authenticated` project, LOCAL ONLY.
 *
 * Every other spec in this suite tests a fragment (form renders, dashboard
 * renders, login renders). None of them chain into "does the product's
 * actual core loop work" — generate a report, land in the validation
 * wizard, reach the report view. This test walks that chain for real,
 * using the same "Fast mock preview" dev-mock path production uses to
 * demo the flow without spending on real research/LLM calls
 * (pages/api/roi-agent.js's useDevMock, gated by devOptions.skipLLM).
 *
 * That gate is `NODE_ENV === 'development'`-only (see IS_DEV in
 * pages/api/roi-agent.js and pages/roi-report.jsx) — it's a mock-data
 * escape hatch, so it deliberately can't be reached against the production
 * build CI runs (`npm start`). Rather than loosen a real gate for test
 * convenience, this test is CI-skipped and runs when a developer executes
 * the suite locally against `npm run dev`. report-access.spec.ts covers the
 * higher-risk access-control logic and does run in CI, by seeding report
 * fixtures directly instead of going through generation.
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

  const companyName = `E2E Golden Path ${Date.now()}`
  await page.getByPlaceholder('e.g. Acme Corp').fill(companyName)
  await page.getByRole('button', { name: /continue/i }).click()

  // Step 2 — email/currency, whatever isn't already prefilled from session.
  const emailInput = page.getByPlaceholder(/work email/i)
  if (await emailInput.isVisible().catch(() => false)) {
    const existing = await emailInput.inputValue()
    if (!existing) await emailInput.fill(process.env.TEST_USER_EMAIL ?? '')
  }

  await page.getByRole('button', { name: /fast mock preview/i }).click()

  // Generation redirects into the validation wizard (reports aren't
  // considered validated until that wizard completes or is skipped).
  await page.waitForURL(/\/report\/.+\/validate/, { timeout: 30_000 })
  await expect(page.getByText(companyName)).toBeVisible({ timeout: 15_000 })

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
