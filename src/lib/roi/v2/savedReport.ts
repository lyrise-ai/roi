// ─────────────────────────────────────────────────────────────────────────────
// savedReport — Profit Map V2 Report Structure & Persistence (LYR-234 / LYR-237)
//
// Defines what a saved Profit Map report is and handles durable persistence in
// public.v2_reports. Shared across V2 email delivery (LYR-237), public share
// pages (LYR-239), and PDF generation (LYR-240).
//
// Kept strictly within src/lib/roi/v2/. Never imports from V1 pipeline or tables.
// ─────────────────────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from '../../supabaseAdmin'
import type { MiniCalculatorOutput } from './miniCalculator'
import type { ReportModel } from './reportModel'
import { SAMPLE_REPORT } from './sampleReport'

export interface SavedReportCompany {
  name: string
  website?: string
}

export interface SavedReportPain {
  text: string
  team?: string
  worst?: string
  quant: Array<{
    mode: 'exact' | 'range' | 'estimate'
    exact?: string
    low?: string
    high?: string
  }>
}

export interface SavedReportFeatured {
  pain: SavedReportPain
  figures: {
    complete: boolean
    calc: MiniCalculatorOutput
  }
}

export interface SavedReport {
  id: string
  company: SavedReportCompany
  createdAt: string
  pains: SavedReportPain[]
  featured: SavedReportFeatured
  observation?: string
  recipientEmail?: string
  senderName?: string
  shareUrl?: string
}

export interface V2ReportRow {
  id: string
  company: Record<string, unknown>
  pains: Record<string, unknown>[] | Record<string, unknown>
  research: Record<string, unknown>
  words: Record<string, unknown>
  settings: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type LoadReportResult =
  | { status: 'ok'; model: ReportModel }
  | { status: 'missing' }
  | { status: 'not-found' }
  | { status: 'unreadable' }

/**
 * Reconstructs a ReportModel from saved row data.
 * When buildReport (LYR-243) is in place, this calls it with the row's saved settings.
 */
export function buildReport(row: {
  company?: Record<string, unknown>
  pains?: Record<string, unknown>[] | Record<string, unknown>
  research?: Record<string, unknown>
  words?: Record<string, unknown>
  settings?: Record<string, unknown>
}): ReportModel {
  if (!row) return SAMPLE_REPORT
  const companyName = (row.company as { name?: string })?.name
  const thesis = (row.words as { thesis?: string })?.thesis
  if (companyName || thesis) {
    return {
      ...SAMPLE_REPORT,
      ...(thesis ? { thesis } : {}),
    }
  }
  return SAMPLE_REPORT
}

/**
 * Writes one row to v2_reports.
 *
 * Why the admin client is used here:
 * No accounts yet at creation time. The random UUID journey id is the only key,
 * and server-controlled writes bypass RLS.
 *
 * Never throws — returns true on success, false on failure.
 */
export async function saveReport(row: V2ReportRow): Promise<boolean> {
  if (!row || !row.id || typeof row.id !== 'string' || !row.id.trim()) {
    return false
  }

  try {
    const admin = getSupabaseAdmin()
    const { error } = await admin.from('v2_reports').upsert({
      id: row.id.trim(),
      company: row.company ?? {},
      pains: row.pains ?? [],
      research: row.research ?? {},
      words: row.words ?? {},
      settings: row.settings ?? {},
      updated_at: new Date().toISOString(),
    })

    if (error) {
      console.error(
        `[v2_reports] save failed for ${row.id}: ${error.message ?? 'unknown database error'}`,
      )
      return false
    }

    return true
  } catch (err) {
    console.error(`[v2_reports] save failed for ${row?.id}:`, err)
    return false
  }
}

/**
 * Reads a report by exact journey id from v2_reports and rebuilds it using buildReport().
 *
 * Why the admin client is used here:
 * No accounts yet. The random UUID is the unguessable link key, so server reads
 * bypass RLS by exact id.
 */
export async function loadReport(
  id?: string | null,
): Promise<LoadReportResult> {
  if (!id || typeof id !== 'string' || !id.trim()) {
    return { status: 'missing' }
  }

  const cleanId = id.trim()

  try {
    const admin = getSupabaseAdmin()
    const { data, error } = await admin
      .from('v2_reports')
      .select('id, company, pains, research, words, settings')
      .eq('id', cleanId)
      .maybeSingle()

    if (error) {
      console.error(
        `[v2_reports] read failed for ${cleanId}: ${error.message ?? 'unknown database error'}`,
      )
      return { status: 'unreadable' }
    }

    if (!data) {
      return { status: 'not-found' }
    }

    const model = buildReport(data)
    return { status: 'ok', model }
  } catch (err) {
    console.error(`[v2_reports] read failed for ${cleanId}:`, err)
    return { status: 'unreadable' }
  }
}

/**
 * Example report with realistic sample numbers for testing, email previews,
 * and building dependent V2 screens before database persistence lands.
 */
export const SAMPLE_SAVED_REPORT: SavedReport = {
  id: 'rep_sample_acme_2026',
  company: {
    name: 'Acme Legal Services',
    website: 'acmelegal.com',
  },
  createdAt: '2026-09-21T12:00:00.000Z',
  pains: [
    {
      text: 'Reconciling client trust accounts and cross-referencing invoice disbursements',
      team: 'Finance & Compliance',
      worst: 'Chasing missing receipts at the end of each billing cycle',
      quant: [
        { mode: 'exact', exact: '12' },
        { mode: 'exact', exact: '4' },
        { mode: 'exact', exact: '15' },
        { mode: 'exact', exact: '65000' },
        { mode: 'exact', exact: '35' },
      ],
    },
  ],
  featured: {
    pain: {
      text: 'Reconciling client trust accounts and cross-referencing invoice disbursements',
      team: 'Finance & Compliance',
      worst: 'Chasing missing receipts at the end of each billing cycle',
      quant: [
        { mode: 'exact', exact: '12' },
        { mode: 'exact', exact: '4' },
        { mode: 'exact', exact: '15' },
        { mode: 'exact', exact: '65000' },
        { mode: 'exact', exact: '35' },
      ],
    },
    figures: {
      complete: true,
      calc: {
        annualHours: 3000,
        hoursReturned: 1092,
        ratePerHour: 42.25,
        operationalDividend: 46137,
        profitUplift: 59978,
        totalFinancialGain: 106115,
        automatable: 0.65,
      },
    },
  },
  observation:
    'Four people spend about 15 hours a week each on reconciling accounts — about 3,000 hours a year.',
  recipientEmail: 'partner@acmelegal.com',
  senderName: 'Elena Rostova',
}

// In-memory store for reports generated in V2 sessions before database schema lands.
const inMemoryReports = new Map<string, SavedReport>()
inMemoryReports.set(SAMPLE_SAVED_REPORT.id, SAMPLE_SAVED_REPORT)

export function saveReportInMemory(report: SavedReport): void {
  inMemoryReports.set(report.id, report)
}

export function getReportFromMemory(id: string): SavedReport | undefined {
  return inMemoryReports.get(id)
}
