// GET /api/demo-report?variant=base|alt
// Returns pre-rendered HTML for the Meridian Consulting Group demo report.
// The real pipeline (roiCalculator → assembleReport → renderTemplate) runs once
// per variant and results are cached in module scope — subsequent requests are
// a cache hit with no computation.
//
// No auth required — this is a marketing demo visible before sign-up.

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

// Module-level cache — templates are deterministic; compute once per cold start.
let cache = null

function renderVariant(state) {
  const calcOutput = roiCalculator(state.workflows, state.globals, state.company)
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
    // Cache-Control: private so CDN doesn't cache (HTML contains company data);
    // max-age=3600 lets the browser reuse within a session.
    res.setHeader('Cache-Control', 'private, max-age=3600')
    return res.status(200).json(html)
  } catch (err) {
    console.error('[demo-report] render failed:', err.message, err.stack)
    return res.status(500).json({ error: 'Failed to render demo report' })
  }
}
