// Helpers that write real report rows straight into the database with the admin
// key, skipping the app entirely.
//
// That lets the access-control tests work with realistic report data without
// depending on the fake-data generation endpoint, which only works in
// development mode and so cannot be reached against the production build CI
// runs. golden-path.spec.ts explains and works around that limit instead.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { buildDevMockReportState } from '@/src/lib/roi/devMockReport'
import { splitStoredState } from '@/src/lib/roi/reportState'
import { loadTemplate } from '@/src/lib/roi/pipeline/renderTemplate'
import type { NormalizedInput } from '@/src/lib/roi/types'

export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set to seed report fixtures — add them to .env.local.',
    )
  }
  return createClient(url, key)
}

const BASE_NORM_INPUT: NormalizedInput = {
  companyName: 'E2E Fixture Co',
  website: 'e2e-fixture.example.com',
  email: 'e2e-fixture@example.com',
  recipientName: 'Test Recipient',
  recipientTitle: 'COO',
  selectedCurrency: 'USD',
  businessDescription: 'Playwright fixture company for automated tests.',
  teamSize: '11-50',
  revenueRange: '',
  industry: 'Technology / SaaS',
  country: 'United States',
  keyPriorities: [],
  processes: [],
  primaryProcess: '',
  volumeHint: '',
  primaryTimeHint: '',
  additionalContext: '',
  workContext: '',
}

// Builds a real report using the same fake-data builder the "Fast mock preview"
// button uses. That gives realistic calculated figures and real HTML, rather
// than a hand-made stand-in that could hide a rendering bug the real viewer
// would hit.
function buildFixtureState(overrides: Partial<NormalizedInput> = {}) {
  const normInput = { ...BASE_NORM_INPUT, ...overrides }
  const execTemplateHtml = loadTemplate('roi-exec-template.html')
  const fullTemplateHtml = loadTemplate('roi-template.html')
  return buildDevMockReportState({
    normInput,
    execTemplateHtml,
    fullTemplateHtml,
  })
}

export async function getUserIdByEmail(
  admin: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await admin
    .from('users')
    .select('id')
    .eq('email', email)
    .single()
  if (error || !data) {
    throw new Error(
      `[reportFixtures] could not find a users row for ${email}: ${error?.message}`,
    )
  }
  return data.id as string
}

// Writes a real, already-checked report owned by the given user.
export async function seedReport(
  admin: SupabaseClient,
  {
    userId,
    overrides = {},
  }: { userId: string; overrides?: Partial<NormalizedInput> },
): Promise<string> {
  const state = buildFixtureState(overrides)
  const { stateData, renderedHtml, renderedFullHtml } = splitStoredState(state)

  const { data, error } = await admin
    .from('reports')
    .insert({
      user_id: userId,
      company_name: state.company?.company ?? BASE_NORM_INPUT.companyName,
      email: state.normInput?.email ?? BASE_NORM_INPUT.email,
      status: 'SUCCESS',
      input_data: state.normInput,
      completed_at: new Date().toISOString(),
      validated_at: new Date().toISOString(),
      rendered_html: renderedHtml,
      rendered_full_html: renderedFullHtml,
      state_data: stateData,
      share_token: crypto.randomBytes(24).toString('base64url'),
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`[reportFixtures] failed to seed report: ${error?.message}`)
  }
  return data.id as string
}

// Does the same as createColleagueInvite in reportGrants.js, without sending the
// email. It writes the invite row directly, so tests can accept and revoke it
// without a real email being sent.
export async function seedColleagueInvite(
  admin: SupabaseClient,
  { reportId, invitedEmail }: { reportId: string; invitedEmail: string },
): Promise<{ grantId: string; token: string }> {
  const token = crypto.randomBytes(24).toString('base64url')
  const { data, error } = await admin
    .from('chat_usage')
    .insert({
      report_id: reportId,
      user_id: null,
      invited_email: invitedEmail,
      invite_token: token,
      message_count: 0,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`[reportFixtures] failed to seed invite: ${error?.message}`)
  }
  return { grantId: data.id as string, token }
}

export async function deleteReport(
  admin: SupabaseClient,
  reportId: string,
): Promise<void> {
  await admin.from('chat_usage').delete().eq('report_id', reportId)
  await admin.from('chat_messages').delete().eq('report_id', reportId)
  await admin.from('reports').delete().eq('id', reportId)
}

// Creates a throwaway account and its matching row, so tests that need
// "somebody else's report" do not depend on a second real account already
// existing in whichever database the suite runs against.
export async function createFixtureUser(
  admin: SupabaseClient,
  email: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomBytes(18).toString('base64url'),
  })
  if (error || !data.user) {
    throw new Error(
      `[reportFixtures] failed to create fixture user: ${error?.message}`,
    )
  }
  const { error: insertError } = await admin
    .from('users')
    .insert({ id: data.user.id, email, role: 'CLIENT' })
  if (insertError) {
    await admin.auth.admin.deleteUser(data.user.id)
    throw new Error(
      `[reportFixtures] failed to insert users row: ${insertError.message}`,
    )
  }
  return data.user.id
}

// Deleting the account deletes everything attached to it — its row, its reports
// and its chat allowances all follow automatically — so this one call cleans up
// everything the test user owned.
export async function deleteFixtureUser(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  await admin.auth.admin.deleteUser(userId)
}
