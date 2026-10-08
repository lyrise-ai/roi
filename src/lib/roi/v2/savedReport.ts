// ─────────────────────────────────────────────────────────────────────────────
// savedReport — Profit Map V2 Report Structure (LYR-234 / LYR-237)
//
// Defines what a saved Profit Map report is. Shared across V2 email delivery
// (LYR-237), public share pages (LYR-239), and PDF generation (LYR-240).
//
// Kept strictly within src/lib/roi/v2/. Never imports from V1 pipeline or tables.
// ─────────────────────────────────────────────────────────────────────────────

import type { MiniCalculatorOutput } from './miniCalculator'

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
  legend?: string
  disclaimer?: string
}

export function toPublicReport(report: SavedReport) {
  return {
    company: { name: report.company?.name || '' },
    pains: report.pains || [],
    featured: report.featured,
    observation: report.observation,
    legend: report.legend,
    disclaimer: report.disclaimer,
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
        formulas: {
          annualHours: '4 people × 15 hrs/wk × 50 wks = 3,000 hrs/yr',
          hoursReturned:
            '3,000 hrs × 65% automatable × 70% adoption × 80% realization = 1,092 hrs/yr',
          ratePerHour: '$65,000 salary × 1.3 overhead ÷ 2,000 hrs = $42.25/hr',
          operationalDividend: '1,092 hrs × $42.25/hr = $46,137',
          profitUplift: '$46,137 dividend × 1.3 = $59,978',
          totalFinancialGain: '$46,137 dividend + $59,978 uplift = $106,115',
        },
      },
    },
  },
  observation:
    'Four people spend about 15 hours a week each on reconciling accounts — about 3,000 hours a year.',
  recipientEmail: 'partner@acmelegal.com',
  senderName: 'Elena Rostova',
  legend: 'Solid values are yours. Anything marked carries its source.',
  disclaimer:
    'This is a directional diagnostic, not financial advice. Validate the assumptions with your team before making an investment decision.',
}

// In-memory store for reports generated in V2 sessions before database schema lands.
const inMemoryReports = new Map<string, SavedReport>()
inMemoryReports.set(SAMPLE_SAVED_REPORT.id, SAMPLE_SAVED_REPORT)

// In-memory store for one-time viewer tokens (reportId -> viewerToken).
// Ensures only the first visitor (the email receiver) can claim and view the report.
const reportViewerTokens = new Map<string, string>()

export function generateViewerToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `vtok_${Math.random().toString(36).slice(2)}_${Date.now()}`
}

export function claimReportViewer(reportId: string, token: string): void {
  reportViewerTokens.set(reportId.trim(), token.trim())
}

export function getReportViewerToken(reportId: string): string | undefined {
  return reportViewerTokens.get(reportId.trim())
}

export function isReportClaimed(reportId: string): boolean {
  return reportViewerTokens.has(reportId.trim())
}

export function resetViewerTokens(): void {
  reportViewerTokens.clear()
}

export function resetViewerTokenForReport(reportId: string): void {
  reportViewerTokens.delete(reportId.trim())
}

export function saveReportInMemory(report: SavedReport): void {
  inMemoryReports.set(report.id.trim(), report)
  // When a report is freshly saved, clear any previous claim token
  // so the intended recipient can claim it on first open.
  reportViewerTokens.delete(report.id.trim())
}

export function getReportFromMemory(id: string): SavedReport | undefined {
  if (typeof id !== 'string') return undefined
  return inMemoryReports.get(id.trim())
}

export function resolveSavedReportForPublicView(
  id?: string,
  viewerToken?: string,
):
  | {
      status: 'ok'
      report: SavedReport
      message: string
      setViewerToken?: string
    }
  | { status: 'missing'; message: string }
  | { status: 'not-found'; message: string }
  | { status: 'unauthorized'; message: string } {
  const cleanedId = typeof id === 'string' ? id.trim() : ''

  if (!cleanedId) {
    return {
      status: 'missing',
      message:
        'This link is missing the report id. Please check the URL and try again.',
    }
  }

  const report = getReportFromMemory(cleanedId)
  if (!report) {
    return {
      status: 'not-found',
      message:
        'We could not find this report. The link may be mistyped, the report may have been deleted, or it may have expired.',
    }
  }

  // Check one-time viewer claim
  const claimedToken = reportViewerTokens.get(cleanedId)

  if (!claimedToken) {
    // Unclaimed report: the first visitor (email recipient) claims it!
    const newToken =
      typeof viewerToken === 'string' && viewerToken.trim()
        ? viewerToken.trim()
        : generateViewerToken()
    reportViewerTokens.set(cleanedId, newToken)
    return {
      status: 'ok',
      report,
      message: 'Report loaded.',
      setViewerToken: newToken,
    }
  }

  // Report was already claimed. Check if caller possesses the matching token.
  if (viewerToken && viewerToken.trim() === claimedToken) {
    return {
      status: 'ok',
      report,
      message: 'Report loaded.',
    }
  }

  // A different visitor without the cookie tried to view the claimed report.
  return {
    status: 'unauthorized',
    message:
      'This report has already been accessed by its recipient and is restricted to that device.',
  }
}
