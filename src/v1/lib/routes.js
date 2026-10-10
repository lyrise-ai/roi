export const ROUTES = {
  login: '/auth/login',
  dashboard: '/dashboard',
  roiReport: '/roi-report',
  roiReportBulk: '/roi-report/bulk',
}

export function loginRedirect(next) {
  if (!next) return ROUTES.login
  return `${ROUTES.login}?next=${encodeURIComponent(next)}`
}
