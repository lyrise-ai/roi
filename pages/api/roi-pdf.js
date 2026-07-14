/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/roi-pdf — Generate and stream a PDF for direct download
//
// Body: { state: ReportState, reportType: 'exec' | 'full' }
// Response: application/pdf binary with Content-Disposition: attachment
//
// Used by the "Download PDF" button so the user gets the real Puppeteer-
// rendered PDF (with the correct CSS-driven margins, no browser print
// header, and a proper filename) instead of the browser's print dialog.
// ─────────────────────────────────────────────────────────────────────────────

import {
  loadTemplate,
  renderTemplate,
} from '@/src/lib/roi/pipeline/renderTemplate'
import { generatePdf } from '@/src/lib/roi/services/pdf'
import { createClient, createAdminClient } from '../../src/lib/supabase-server'
import { buildStateFromReportRow } from '@/src/lib/roi/reportState'
import { isEmployeeUser } from '@/src/lib/isEmployee'
import { hasReportAccess, getGrantForUser } from '@/src/lib/roi/reportGrants'

export const config = {
  maxDuration: 120,
  api: {
    responseLimit: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { reportId, reportType = 'full' } = req.body ?? {}

  if (!reportId) {
    res.status(400).json({ error: 'reportId is required' })
    return
  }

  const admin = createAdminClient()
  const [{ data: userData }, { data: report }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin
      .from('reports')
      .select(
        'id, user_id, company_name, email, input_data, state_data, rendered_html, rendered_full_html',
      )
      .eq('id', reportId)
      .single(),
  ])

  const isEmployee = isEmployeeUser(user, userData)
  const grant = report
    ? await getGrantForUser({ admin, reportId, userId: user.id })
    : null

  if (
    !report ||
    !hasReportAccess({ report, userId: user.id, isEmployee, grant })
  ) {
    res.status(403).json({ error: 'Unauthorized' })
    return
  }

  const state = buildStateFromReportRow(report)

  if (!state?.assembled) {
    res.status(400).json({ error: 'state.assembled is required' })
    return
  }

  try {
    const templateName =
      reportType === 'exec' ? 'roi-exec-template.html' : 'roi-template.html'
    const templateHtml = loadTemplate(templateName)
    const renderedHtml = renderTemplate(templateHtml, state.assembled)

    const company = state.assembled.roi_data?.company ?? 'Report'
    const safeCompany =
      company.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Report'
    const typeLabel = reportType === 'exec' ? 'Executive' : 'Full'
    const filename = `${safeCompany}_${typeLabel}_ROI.pdf`

    const pdf = await generatePdf(renderedHtml, filename)
    const buffer = Buffer.from(pdf.base64, 'base64')

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Length', buffer.length)
    res.status(200).send(buffer)
  } catch (err) {
    console.error('[roi-pdf] Error:', err)
    res.status(500).json({ error: err?.message ?? 'Failed to generate PDF' })
  }
}
