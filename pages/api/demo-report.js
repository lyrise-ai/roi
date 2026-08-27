// GET /api/demo-report?variant=base|alt
// Returns the finished HTML for the Meridian Consulting Group demo report.
//
// The real pipeline — calculate, assemble, render — runs once per version, and
// we keep the result in memory. Every request after the first gets the saved
// copy with no work done.
//
// No sign-in needed: this is a marketing demo people see before signing up.

import { roiCalculator } from '@/src/lib/roi/pipeline/roiCalculator'
import { assembleReport } from '@/src/lib/roi/pipeline/assembleReport'
import {
  loadTemplate,
  renderTemplate,
} from '@/src/lib/roi/pipeline/renderTemplate'
import {
  MERIDIAN_BASE_STATE,
  MERIDIAN_ALT_STATE,
} from '@/src/lib/roi/demoReportData'

// Kept in memory. The templates always produce the same output, so we build
// them once per server start.
let cache = null

function renderVariant(state) {
  const calcOutput = roiCalculator(
    state.workflows,
    state.globals,
    state.company,
  )
  const assembled = assembleReport({ ...state, calcOutput })
  const execTemplate = loadTemplate('roi-exec-template.html')
  const fullTemplate = loadTemplate('roi-template.html')
  return {
    execHtml: renderTemplate(execTemplate, assembled),
    fullHtml: renderTemplate(fullTemplate, assembled),
  }
}

function getCache() {
  if (!cache) {
    cache = {
      base: renderVariant(MERIDIAN_BASE_STATE),
      alt: renderVariant(MERIDIAN_ALT_STATE),
    }
  }
  return cache
}

export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).end()
  }

  const variant = req.query.variant === 'alt' ? 'alt' : 'base'

  try {
    const html = getCache()[variant]
    // "private" so the CDN never stores it — the HTML contains company data.
    // The hour-long limit lets one visitor's browser reuse it during a
    // session.
    res.setHeader('Cache-Control', 'private, max-age=3600')
    return res.status(200).json(html)
  } catch (err) {
    console.error('[demo-report] render failed:', err.message, err.stack)
    return res.status(500).json({ error: 'Failed to render demo report' })
  }
}
