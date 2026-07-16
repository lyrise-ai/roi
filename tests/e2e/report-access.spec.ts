/**
 * Report access-control tests — runs in the `authenticated` project.
 *
 * Covers the highest-risk code on the report-viewing path:
 * resolveReportViewerAccess / reportGrants (src/lib/roi/reportViewerAccess.js,
 * src/lib/roi/reportGrants.js). A bug here doesn't 500 — it shows one
 * person's report, and their chat history, to somebody else. That includes
 * the colleague-invite flow, which silently signs a browser out and back in
 * as a different identity server-side based on a query param — exactly the
 * kind of access-control code that deserves a real browser test, not just a
 * status-code check.
 *
 * Fixtures are seeded directly via the Supabase service role
 * (tests/e2e/utils/reportFixtures.ts) so none of this depends on real AI
 * generation, real email delivery, or a second pre-existing account.
 */
import { test, expect } from '@playwright/test'
import {
  adminClient,
  getUserIdByEmail,
  seedReport,
  seedColleagueInvite,
  deleteReport,
  createFixtureUser,
  deleteFixtureUser,
} from './utils/reportFixtures'

const admin = adminClient()
const runId = Date.now()

test.describe('viewing a report you have no access to', () => {
  let otherUserId: string
  let otherUsersReportId: string

  test.beforeAll(async () => {
    otherUserId = await createFixtureUser(
      admin,
      `e2e-other-owner-${runId}@lyrise-fixture.test`,
    )
    otherUsersReportId = await seedReport(admin, { userId: otherUserId })
  })

  test.afterAll(async () => {
    await deleteReport(admin, otherUsersReportId)
    await deleteFixtureUser(admin, otherUserId)
  })

  test('redirects to /dashboard instead of showing the report', async ({
    page,
  }) => {
    await page.goto(`/report/${otherUsersReportId}`)
    await expect(page).toHaveURL(/dashboard/)
    await expect(page).not.toHaveURL(/auth\/login/)
  })
})

test.describe('colleague invite claim + revoke', () => {
  let ownerId: string
  let reportId: string
  const invitedEmail = `e2e-colleague-${runId}@lyrise-fixture.test`

  test.beforeAll(async () => {
    const email = process.env.TEST_USER_EMAIL
    if (!email) throw new Error('TEST_USER_EMAIL must be set for this suite')
    ownerId = await getUserIdByEmail(admin, email)
    reportId = await seedReport(admin, { userId: ownerId })
  })

  test.afterAll(async () => {
    await deleteReport(admin, reportId)
  })

  test('an invite link silently grants access, and revoking it removes access', async ({
    browser,
    request,
  }) => {
    const { grantId, token } = await seedColleagueInvite(admin, {
      reportId,
      invitedEmail,
    })

    // Fresh, unauthenticated context — the invite must work cold, with no
    // prior sign-in, exactly like a colleague clicking the link from email.
    const colleagueContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    })
    const colleaguePage = await colleagueContext.newPage()

    await colleaguePage.goto(`/report/${reportId}?invite=${token}`)
    await expect(colleaguePage).not.toHaveURL(/auth\/login/)
    await expect(colleaguePage).toHaveURL(new RegExp(`/report/${reportId}`))
    await expect(
      colleaguePage.getByText(/E2E Fixture Co/).first(),
    ).toBeVisible()

    // Revoke as the owner, through the real endpoint (`request` here runs
    // with the authenticated project's saved owner session).
    const revokeRes = await request.delete('/api/roi-report-shares', {
      data: { reportId, grantId },
    })
    expect(revokeRes.status()).toBe(200)

    // Same colleague session, no invite token this time — access must now
    // be gone.
    await colleaguePage.goto(`/report/${reportId}`)
    await expect(colleaguePage).toHaveURL(/dashboard/)

    await colleagueContext.close()
  })

  test('the colleague cannot revoke their own access', async ({ browser }) => {
    const { grantId, token } = await seedColleagueInvite(admin, {
      reportId,
      invitedEmail: `e2e-colleague-b-${runId}@lyrise-fixture.test`,
    })

    const colleagueContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    })
    const colleaguePage = await colleagueContext.newPage()
    // Claim the invite first so this request carries an authenticated (but
    // non-owner, non-employee) colleague session.
    await colleaguePage.goto(`/report/${reportId}?invite=${token}`)
    await expect(
      colleaguePage.getByText(/E2E Fixture Co/).first(),
    ).toBeVisible()

    const res = await colleagueContext.request.delete(
      '/api/roi-report-shares',
      {
        data: { reportId, grantId },
      },
    )
    expect(res.status()).toBe(403)

    await admin.from('chat_usage').delete().eq('id', grantId)
    await colleagueContext.close()
  })
})
