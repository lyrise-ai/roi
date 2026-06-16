import { sendReportAccessAlert } from '@/src/lib/roi/services/email'

function buildBaseUrl(req) {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL
  const host = req?.headers?.host
  const proto =
    req?.headers?.['x-forwarded-proto'] ||
    (host && host.startsWith('localhost') ? 'http' : 'https')
  return explicit ?? (host ? `${proto}://${host}` : 'https://lyrise.ai')
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

  const { count, error: countError } = await admin
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId)
    .eq('type', eventType)

  if (countError) {
    console.error('[report-access] event count failed:', countError)
  }

  const tasks = [
    admin.from('events').insert({
      user_id: viewerUserId,
      report_id: reportId,
      type: eventType,
    }),
  ]

  const shouldNotifyOps = !isEmployee && (count ?? 0) === 0
  if (shouldNotifyOps) {
    tasks.push(
      sendReportAccessAlert({
        companyName: report.company_name,
        ownerEmail: report.email,
        viewerEmail,
        viewerUserId,
        reportId,
        reportUrl: buildReportUrl({ req, reportId, token, isAlpha }),
        accessType,
      }),
    )
  }

  const results = await Promise.allSettled(tasks)
  results.forEach((result) => {
    if (result.status === 'rejected') {
      console.error('[report-access] tracking failed:', result.reason)
    } else if (result.value?.error) {
      console.error('[report-access] event insert failed:', result.value.error)
    }
  })
}
