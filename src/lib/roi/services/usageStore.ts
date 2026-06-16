/* eslint-disable no-console */
// ─────────────────────────────────────────────────────────────────────────────
// usageStore — persists a UsageSummary to Supabase (roi_usage table).
//
// Kept separate from UsageTracker so the tracker stays pure (usable in evals /
// local scripts with no DB). On Vercel the local NDJSON file written by
// flush() is ephemeral, so this is the durable sink that feeds the dashboard.
//
// Fire-and-forget: never throws into the request path. A monitoring write must
// never break report generation.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseAdmin } from '@/src/lib/supabaseAdmin'

import { maybeSendUsageCostAlert } from './usageAlerts'
import type { UsageSummary } from './usageTracker'

export async function persistUsage(
  summary: UsageSummary,
  ids: { reportId: string; userId?: string | null },
): Promise<void> {
  // report_id is NOT NULL with a unique(report_id) constraint, so we need a
  // saved report before we can persist. Skip if it's missing rather than throw.
  if (!ids?.reportId) {
    console.warn('[roi-usage] persistUsage skipped — no reportId')
    return
  }
  try {
    // Additive upsert: a report's cost accrues across the initial generation
    // AND every chat turn. The upsert_roi_usage RPC sums cost/tokens/duration
    // and concatenates calls on conflict, so a cheap chat turn never overwrites
    // the expensive generation row. created_at defaults to now() in the DB.
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
