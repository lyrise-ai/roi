import { sendReportAccessAlert } from '@/src/lib/roi/services/email'
import { visitStarts } from '@/src/lib/roi/services/visitWindow'

// Prefer the request's own host over NEXT_PUBLIC_BASE_URL: the header always
// matches whatever domain actually served this request (production, a Vercel
// preview deploy, or localhost), whereas the env var is one fixed value per
// environment and easy to leave stale (e.g. copied from .env.local).
function buildBaseUrl(req) {
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host
  if (host) {
    const proto =
      req?.headers?.['x-forwarded-proto'] ||
      (host.startsWith('localhost') ? 'http' : 'https')
    return `${proto}://${host}`
  }
  return process.env.NEXT_PUBLIC_BASE_URL ?? 'https://lyrise.ai'
}

function buildReportUrl({ req, reportId, token, isAlpha }) {
  const url = new URL(`/report/${reportId}`, buildBaseUrl(req))
  if (token) url.searchParams.set('t', token)
  if (isAlpha) url.searchParams.set('alpha', 'true')
  return url.toString()
}

function getAccessType({ isShareLink, isAlpha, isEmployee }) {
  if (isShareLink) return 'shared email link'
  if (isAlpha) return 'alpha report'
  if (isEmployee) return 'internal dashboard report'
  return 'dashboard report'
}

function getEventType({ isShareLink, isAlpha, isEmployee }) {
  if (isShareLink) return 'report_link_accessed_share'
  if (isAlpha) return 'report_link_accessed_alpha'
  if (isEmployee) return 'report_link_accessed_internal'
  return 'report_link_accessed'
}

export async function trackReportAccess({
  admin,
  req,
  report,
  reportId,
  token = null,
  viewerEmail = null,
  viewerUserId = null,
  isShareLink = false,
  isAlpha = false,
  isEmployee = false,
}) {
  const eventType = getEventType({ isShareLink, isAlpha, isEmployee })
  const accessType = getAccessType({ isShareLink, isAlpha, isEmployee })

  // Record first, decide second. Two requests from the same open land
  // milliseconds apart, so anything decided from a read taken *before* the
  // write has both of them believing they are the only one — which is how a
  // single visit produced two alerts numbered #2 and #3.
  const { data: inserted, error: insertError } = await admin
    .from('events')
    .insert({ user_id: viewerUserId, report_id: reportId, type: eventType })
    .select('created_at')
    .single()

  if (insertError) {
    console.error('[report-access] event insert failed:', insertError)
  }

  // Only logged-in employees viewing a report are excluded; every external
  // and tester access is worth an alert.
  if (isEmployee) return

  // ponytail: anonymous share-link viewers share one identity, so two
  // different people opening the same link within the window read as one
  // visitor. Give the viewer a cookie if that distinction ever matters.
  let history = admin
    .from('events')
    .select('created_at')
    .eq('report_id', reportId)
    .eq('type', eventType)
  history = viewerUserId
    ? history.eq('user_id', viewerUserId)
    : history.is('user_id', null)

  const { data: rows, error: historyError } = await history.order(
    'created_at',
    {
      ascending: true,
    },
  )

  if (historyError) {
    console.error('[report-access] visit history failed:', historyError)
  }

  const times = (rows ?? []).map((row) => new Date(row.created_at).getTime())
  const starts = visitStarts(times)
  const mine = inserted?.created_at
    ? new Date(inserted.created_at).getTime()
    : null

  // Someone else's request already opened this visit — it has been counted
  // and alerted, and this one is the same person still arriving.
  if (mine !== null && starts.at(-1) !== mine) return

  try {
    await sendReportAccessAlert({
      companyName: report.company_name,
      ownerEmail: report.email,
      viewerEmail,
      viewerUserId,
      reportId,
      reportUrl: buildReportUrl({ req, reportId, token, isAlpha }),
      accessType,
      visitNumber: starts.length,
    })
  } catch (err) {
    // Nothing on the report path throws: a missed alert must not cost the
    // viewer the page they asked for.
    console.error('[report-access] alert failed:', err)
  }
}
