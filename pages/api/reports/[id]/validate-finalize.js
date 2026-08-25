// POST /api/reports/[id]/validate-finalize — takes the decisions the user made
// in the check-it-over wizard (keep or remove each workflow, and any corrected
// volume or duration), applies them to the report's workflows, redoes the
// calculations and the HTML — all plain code, no model call — and marks the
// report as checked.
//
// "Add a workflow we missed" and the free-text "anything else" box are handled
// separately and immediately, through the chat endpoint. By the time this runs,
// the report already includes those edits.

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
import { buildBaselineSnapshot } from '@/src/lib/roi/pipeline/validationBaseline'
import { EVENTS } from '@/src/lib/analytics'
import { captureServer, flushPostHog } from '@/src/lib/posthog-server'

function logEvent(admin, row) {
  admin
    .from('events')
    .insert(row)
    .then(({ error }) => {
      if (error) console.error(`event insert failed (${row.type})`, error)
    })
}

// Compares the current workflows against the copy taken before the user started.
// Anything not in that copy was added through chat since. Anything in the copy
// the user chose not to keep was removed.
//
// This only means anything across separate visits: within one visit, workflows
// added through chat are already part of the list by the time we take the
// copy (see the note at the top of this file).
function buildWorkflowChanges(workflows, baseline, workflowDecisions) {
  const baselineNames = new Set(Object.keys(baseline.workflows))
  return {
    added: (workflows ?? [])
      .map((w) => w.name)
      .filter((name) => !baselineNames.has(name)),
    removed: Object.keys(baseline.workflows).filter(
      (name) => workflowDecisions[name]?.kept === false,
    ),
  }
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

  // This is normally taken when the report is first generated, before any chat
  // edit can touch it. What follows is a fallback for reports made before that
  // existed. We keep whichever copy is already there rather than taking a new
  // one on a second visit, when the workflows would already show earlier
  // changes.
  const existingBaseline = report.validation_data?.baseline ?? null

  // The skip path, which only staff and bulk previews can use (see canSkip in
  // pages/report/[id]/validate.jsx). It marks the report checked without
  // touching any of the numbers.
  if (skipped) {
    const baseline =
      existingBaseline ??
      buildBaselineSnapshot(
        buildStateFromReportRow(report).workflows,
        nowIso,
        'finalize-fallback',
      )
    const nextValidationData = {
      ...(report.validation_data ?? {}),
      completedAt: nowIso,
      skipped: true,
      baseline,
      workflowChanges: { added: [], removed: [] },
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
      type: EVENTS.VALIDATION_SKIPPED,
    })
    captureServer(EVENTS.VALIDATION_SKIPPED, { report_id: id }, user.id)
    await flushPostHog()
    return res.status(200).json({ ok: true, reportId: id, qualifies: null })
  }

  const state = buildStateFromReportRow(report)
  if (!state.workflows) {
    return res
      .status(400)
      .json({ error: 'Report has no workflows to validate' })
  }

  // The fallback copy (see above). We take it before anything below changes the
  // workflows, so it still contains the ones the user is about to remove, not
  // only the survivors.
  const baseline =
    existingBaseline ??
    buildBaselineSnapshot(state.workflows, nowIso, 'finalize-fallback')
  const workflowChanges = buildWorkflowChanges(
    state.workflows,
    baseline,
    workflowDecisions,
  )

  // Remove first, so the volume and duration corrections below only ever touch
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

  // Anything the wizard's decisions did not mention — a workflow added through
  // chat partway through, for instance — reached the end without being removed,
  // so we count it as checked too.
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
    baseline,
    workflowChanges,
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
    type: EVENTS.VALIDATION_COMPLETED,
    meta: { ...feedback, budgetTiming, qualifies, xp, skipped: false },
  })
  captureServer(
    EVENTS.VALIDATION_COMPLETED,
    {
      report_id: id,
      budget_timing: budgetTiming,
      qualifies,
      xp,
      skipped: false,
    },
    user.id,
  )
  await flushPostHog()

  return res.status(200).json({ ok: true, reportId: id, qualifies })
}
