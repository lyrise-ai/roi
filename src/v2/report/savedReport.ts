// ─────────────────────────────────────────────────────────────────────────────
// savedReport — Profit Map V2 Report Structure & Persistence (LYR-234 / LYR-237)
//
// Defines what a saved Profit Map report is and handles durable persistence in
// public.v2_reports. Shared across V2 email delivery (LYR-237), public share
// pages (LYR-239), and PDF generation (LYR-240).
//
// Kept strictly within src/v2/report/. Never imports from V1 pipeline or tables.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '@/src/lib/supabaseAdmin'
import type { SegmentedAnswer } from '@/src/v2/report/answerBridge'

export interface ReportCompany {
  name: string
  website?: string
}

export interface ReportPain {
  text: string
  team?: string
  worst?: string
  quant: SegmentedAnswer[]
}

export interface V2ReportRow {
  id: string
  owner_id?: string | null
  company: Record<string, unknown>
  pains: Record<string, unknown>[]
  research: Record<string, unknown>
  words: Record<string, unknown>
  settings: Record<string, unknown>
}

/* What a shared link may show. Figures are rebuilt from saved inputs; never
   return claim_token or owner_id. */
export type LoadedReport = Pick<
  V2ReportRow,
  'id' | 'research' | 'words' | 'settings'
> & {
  company: ReportCompany
  pains: ReportPain[]
}

export type LoadReportResult =
  | { status: 'ok'; report: LoadedReport }
  | { status: 'missing' }
  | { status: 'not-found' }
  | { status: 'unreadable' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isReportId = (id: unknown): id is string =>
  typeof id === 'string' && UUID.test(id)

const isObject = (v: unknown) =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Inserts one new row into v2_reports and returns its claim token, or null.
 *
 * Insert, never upsert: a known id can't be used to overwrite someone's report.
 * Admin client because nobody is signed in yet; the browser keys have no
 * write rights on this table.
 *
 * Never throws.
 */
export async function saveReport(row: V2ReportRow): Promise<string | null> {
  if (
    !row ||
    !isReportId(row.id) ||
    !isObject(row.company) ||
    !Array.isArray(row.pains) ||
    !isObject(row.research) ||
    !isObject(row.words) ||
    !isObject(row.settings)
  ) {
    return null
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('v2_reports')
      .insert({
        id: row.id,
        owner_id: row.owner_id ?? null,
        company: row.company,
        pains: row.pains,
        research: row.research,
        words: row.words,
        settings: row.settings,
      })
      .select('claim_token')
      .single()

    if (error) {
      console.error(`[v2_reports] save failed for ${row.id}: ${error.message}`)
      return null
    }
    return data.claim_token
  } catch (err) {
    console.error(`[v2_reports] save failed for ${row.id}:`, err)
    return null
  }
}

/**
 * Gives an unowned report to a signed-in user, if they hold its claim token.
 * Only the browser that saved the report has the token, so a forwarded link
 * can't claim. True only when a row actually changed.
 *
 * Never throws.
 */
export async function claimReport(
  id: string,
  userId: string,
  claimToken: string,
): Promise<boolean> {
  if (!isReportId(id) || !isReportId(claimToken) || !userId) return false

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('v2_reports')
      .update({ owner_id: userId })
      .eq('id', id)
      .eq('claim_token', claimToken)
      .is('owner_id', null)
      .select('id')

    if (error) {
      console.error(`[v2_reports] claim failed for ${id}: ${error.message}`)
      return false
    }
    return data.length === 1
  } catch (err) {
    console.error(`[v2_reports] claim failed for ${id}:`, err)
    return false
  }
}

/**
 * Reads a report by exact id. The id is the key, so this reads with the admin
 * client by exact id only.
 *
 * Never throws.
 */
export async function loadReport(
  id?: string | null,
): Promise<LoadReportResult> {
  if (!id || typeof id !== 'string' || !id.trim()) return { status: 'missing' }
  if (!isReportId(id.trim())) return { status: 'not-found' }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('v2_reports')
      .select('id, company, pains, research, words, settings')
      .eq('id', id.trim())
      .maybeSingle()

    if (error) {
      console.error(`[v2_reports] read failed for ${id}: ${error.message}`)
      return { status: 'unreadable' }
    }
    if (!data) return { status: 'not-found' }
    return { status: 'ok', report: data }
  } catch (err) {
    console.error(`[v2_reports] read failed for ${id}:`, err)
    return { status: 'unreadable' }
  }
}
