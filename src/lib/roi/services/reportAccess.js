import { sendReportAccessAlert } from '@/src/lib/roi/services/email'
import { visitStarts } from '@/src/lib/roi/services/visitWindow'

// Use the domain this request actually came in on, rather than the one in the
// settings. The request always knows the real domain — production, a preview
// deploy, or localhost — while the setting is one fixed value per environment
// and easy to leave out of date, for instance by copying it from .env.local.
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

  // Write first, then decide. Two requests from one person opening a report
  // arrive milliseconds apart. If we decide from a read taken BEFORE the write,
  // both of them think they are the only one — which is how a single visit
  // produced two alerts, numbered #2 and #3.
  const { data: inserted, error: insertError } = await admin
    .from('events')
    .insert({ user_id: viewerUserId, report_id: reportId, type: eventType })
    .select('created_at')
    .single()

  if (insertError) {
    console.error('[report-access] event insert failed:', insertError)
  }

  // We only skip our own signed-in staff. Every outside visitor and tester is
  // worth an alert.
  if (isEmployee) return

  // ponytail: everyone opening a share link looks like the same person to us,
  // so two different people opening one link close together count as one
  // visitor. Give the viewer a cookie if that ever matters.
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

  // Another request already started this visit. It has been counted and
  // alerted, and this one is the same person still loading the page.
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
    // Nothing on the report path is allowed to throw. A missed alert must never
    // cost the visitor the page they asked for.
    console.error('[report-access] alert failed:', err)
  }
}
