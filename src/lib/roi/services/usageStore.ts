/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// usageStore — saves a run's cost summary to Supabase, in the roi_usage table.
//
// Kept separate from the tracker so the tracker stays plain code, usable in
// evals and local scripts with no database. On Vercel the log file the tracker
// writes disappears with the server, so this is the copy that survives and
// feeds the dashboard.
//
// We start it and move on. It never throws back into the request. A write for
// monitoring must never break report generation.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/src/lib/supabaseAdmin'

import { maybeSendUsageCostAlert } from './usageAlerts'
import type { UsageSummary } from './usageTracker'

export async function persistUsage(
  summary: UsageSummary,
  ids: { reportId: string; userId?: string | null },
): Promise<void> {
  // The table requires a report id and allows only one row per report, so the
  // report has to be saved first. If we have no id, we skip rather than
  // throw.
  if (!ids?.reportId) {
    console.warn('[roi-usage] persistUsage skipped — no reportId')
    return
  }
  try {
    const supabaseAdmin = getSupabaseAdmin()
    // This adds to the row rather than replacing it. A report's cost builds up
    // across the first generation AND every chat turn afterwards. The database
    // function adds the cost, tokens and time together and appends the call
    // list, so a cheap chat turn can never wipe out the expensive generation
    // row.
    const { error } = await supabaseAdmin.rpc('upsert_roi_usage', {
      p_report_id: ids.reportId,
      p_user_id: ids.userId ?? null,
      p_company: summary.company,
      p_mode: summary.mode,
      p_duration_ms: summary.durationMs,
      p_input_tokens: summary.totals.inputTokens,
      p_output_tokens: summary.totals.outputTokens,
      p_total_tokens: summary.totals.totalTokens,
      p_cost_usd: summary.totals.costUsd,
      p_calls: summary.calls,
    })
    if (error) {
      console.warn('[roi-usage] Supabase insert failed:', error.message)
      return
    }

    await maybeSendUsageCostAlert({
      reportId: ids.reportId,
      company: summary.company,
      mode: summary.mode,
      incrementCostUsd: summary.totals.costUsd,
    })
  } catch (err) {
    console.warn('[roi-usage] persistUsage threw:', err)
  }
}
