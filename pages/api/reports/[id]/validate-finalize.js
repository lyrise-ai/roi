// POST /api/reports/[id]/validate-finalize — applies the validation wizard's
// keep/remove + volume/duration decisions onto the report's WorkflowInput[],
// recomputes the calculator/report HTML (pure — no LLM call), and marks the
// report validated. "Add a workflow we missed" and freeform "additional
// context" are applied separately, live, via /api/roi-agent (mode: 'chat') —
// by the time this runs, state.workflows already reflects those edits.

import { createClient, createAdminClient } from '@/src/lib/supabase-server'
import {
  buildStateFromReportRow,
  splitStoredState,
} from '@/src/lib/roi/reportState'
import { recomputeReportState } from '@/src/lib/roi/agent'
import {
  patchWorkflow,
  removeWorkflowByName,
} from '@/src/lib/roi/pipeline/workflowMutations'
import { loadTemplate } from '@/src/lib/roi/pipeline/renderTemplate'
import { VALIDATION_QUALIFY_MONTHLY_THRESHOLD } from '@/src/lib/roi/constants'

function logEvent(admin, row) {
  admin
    .from('events')
    .insert(row)
    .then(({ error }) => {
      if (error) console.error(`event insert failed (${row.type})`, error)
    })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return res.status(401).json({ error: 'Unauthorized' })

  const { id } = req.query
  if (!id) return res.status(400).json({ error: 'id is required' })

  const {
    workflowDecisions = {},
    additionalContext = '',
    feedback = {},
    budgetTiming = null,
    xp = 0,
    skipped = false,
  } = req.body ?? {}

  const admin = createAdminClient()
  const [{ data: userData }, { data: report }] = await Promise.all([
    admin.from('users').select('role').eq('id', user.id).single(),
    admin.from('reports').select('*').eq('id', id).single(),
  ])

  if (!report) return res.status(404).json({ error: 'Not found' })

  const isEmployee =
    userData?.role === 'EMPLOYEE' || user.email?.endsWith('@lyrise.ai')
  if (!isEmployee && report.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  const nowIso = new Date().toISOString()

  // Skip path (employee/bulk preview only — see pages/report/[id]/validate.jsx's
  // canSkip) — mark validated without touching the workflow model.
  if (skipped) {
    const nextValidationData = {
      ...(report.validation_data ?? {}),
      completedAt: nowIso,
      skipped: true,
    }
    const { error } = await admin
      .from('reports')
      .update({ validated_at: nowIso, validation_data: nextValidationData })
      .eq('id', id)

    if (error) {
      console.error('[validate-finalize] skip update failed:', error)
      return res.status(500).json({ error: 'Failed to skip validation' })
    }

    logEvent(admin, {
      user_id: user.id,
      report_id: id,
      type: 'validation_skipped',
    })
    return res.status(200).json({ ok: true, reportId: id, qualifies: null })
  }

  const state = buildStateFromReportRow(report)
  if (!state.workflows) {
    return res
      .status(400)
      .json({ error: 'Report has no workflows to validate' })
  }

  // Remove first so the volume/duration pass below only ever touches
  // workflows the user actually kept.
  let workflows = state.workflows
  Object.entries(workflowDecisions).forEach(([name, decision]) => {
    if (!decision?.kept) workflows = removeWorkflowByName(workflows, name)
  })

  Object.entries(workflowDecisions).forEach(([name, decision]) => {
    if (!decision?.kept) return
    const current = workflows.find((w) => w.name === name)
    if (!current) return
    const volumePct = Number(decision.volumePct) || 0
    const durationPct = Number(decision.durationPct) || 0
    workflows = patchWorkflow(workflows, name, {
      monthlyVolume: Math.max(
        1,
        Math.round(current.monthlyVolume * (1 + volumePct / 100)),
      ),
      minutesPerItemBefore: Math.max(
        1,
        Math.round(current.minutesPerItemBefore * (1 + durationPct / 100)),
      ),
      userValidated: true,
    })
  })

  // Anything left over that the wizard's decision map didn't mention (e.g. a
  // workflow added mid-wizard via chat) still made it to finalize without
  // being removed, so treat it as validated too.
  workflows = workflows.map((w) =>
    Object.prototype.hasOwnProperty.call(workflowDecisions, w.name)
      ? w
      : { ...w, userValidated: true },
  )

  state.workflows = workflows

  const execTemplateHtml = loadTemplate('roi-exec-template.html')
  const fullTemplateHtml = loadTemplate('roi-template.html')
  recomputeReportState(state, execTemplateHtml, fullTemplateHtml)

  const monthlyGain =
    (state.calcOutput?.summary?.totalFinancialGain12mo ?? 0) / 12
  const qualifies = monthlyGain >= VALIDATION_QUALIFY_MONTHLY_THRESHOLD

  const { stateData, renderedHtml, renderedFullHtml } = splitStoredState(state)

  const nextValidationData = {
    version: 1,
    startedAt: report.validation_data?.startedAt ?? nowIso,
    completedAt: nowIso,
    workflowDecisions,
    additionalContext,
    feedback,
    budgetTiming,
    xp,
    qualifies,
    skipped: false,
  }

  const { error } = await admin
    .from('reports')
    .update({
      state_data: stateData,
      rendered_html: renderedHtml,
      rendered_full_html: renderedFullHtml,
      validated_at: nowIso,
      validation_data: nextValidationData,
    })
    .eq('id', id)

  if (error) {
    console.error('[validate-finalize] update failed:', error)
    return res.status(500).json({ error: 'Failed to finalize validation' })
  }

  logEvent(admin, {
    user_id: user.id,
    report_id: id,
    type: 'validation_completed',
    meta: { ...feedback, budgetTiming, qualifies, xp, skipped: false },
  })

  return res.status(200).json({ ok: true, reportId: id, qualifies })
}
