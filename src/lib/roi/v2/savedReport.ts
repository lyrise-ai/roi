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
  reportSections?: {
    startingPoint?: {
      title: string
      body: string
      recommendation: string
      workflowName: string
      why: string
    }
    snapshot?: Array<{ label: string; value: string; source?: string }>
    workflows?: Array<{
      id: string
      name: string
      agent: string
      hours: string
      gain: string
      details: {
        hoursToday: string
        hoursAfter: string
        personHours: string
        scope: string
        formula: string
        wagesBack: string
        freedTime: string
        assumptions: Array<{ name: string; value: string; reason: string }>
        fullSum: string
      }
    }>
    rejected?: Array<{ name: string; reason: string }>
    processMap?: {
      title: string
      intro: string
      steps: Array<{ name: string; detail: string; owner: string }>
    }
    profitUplift?: {
      title: string
      intro: string
      metrics: Array<{ label: string; value: string; detail?: string }>
    }
    outlook?: {
      intro: string
      years: Array<{ label: string; value: string; detail?: string }>
    }
    costOfDelay?: { intro: string; value: string; period: string; body: string }
    roadmap?: {
      intro: string
      phases: Array<{ name: string; detail: string; when: string }>
    }
    nextSteps?: { intro: string; steps: string[] }
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
  reportSections: {
    startingPoint: {
      title: 'Start with the work that keeps finance awake at night.',
      body: 'A focused first workflow can return meaningful capacity without asking the firm to change everything at once.',
      recommendation:
        'Begin with a workflow that is repetitive, measurable, and already owned by a team that feels the cost every week.',
      workflowName: 'Trust account reconciliation',
      why: 'It is the clearest first move: the work is frequent, rule-led, and expensive when a missing receipt delays the close.',
    },
    snapshot: [
      { label: 'Firm', value: 'Acme Legal Services', source: 'Your answer' },
      {
        label: 'People doing the work',
        value: '4 people',
        source: 'Your answer',
      },
      {
        label: 'Time spent',
        value: '15 hrs / person / week',
        source: 'Your answer',
      },
      { label: 'Average salary', value: '$65,000', source: 'Your answer' },
    ],
    workflows: [
      {
        id: 'trust-account-reconciliation',
        name: 'Trust account reconciliation',
        agent: 'Finance agent',
        hours: '1,092 hrs / yr',
        gain: '$106,115 / yr',
        details: {
          hoursToday: '3,000 hrs / yr',
          hoursAfter: '1,908 hrs / yr',
          personHours:
            '1,908 hours stay with a person for review, exceptions, and sign-off.',
          scope:
            'Match transactions, cross-reference invoice disbursements, flag missing receipts, and prepare the reconciliation pack for approval.',
          formula:
            '3,000 hours × 65% automatable × 70% adoption × 80% realization = 1,092 hours returned',
          wagesBack: '$46,137 / yr',
          freedTime: '1,092 hrs / yr',
          assumptions: [
            {
              name: 'Automatable',
              value: '65%',
              reason:
                'Rule-led matching and document checks are repeatable; judgement stays with the team.',
            },
            {
              name: 'Take-up',
              value: '70%',
              reason:
                'The model allows for a phased rollout rather than assuming every person changes on day one.',
            },
            {
              name: 'Realization',
              value: '80%',
              reason:
                'Not every theoretical saving becomes usable capacity in the first year.',
            },
            {
              name: 'Loaded hourly rate',
              value: '$42.25 / hr',
              reason: '$65,000 salary × 1.3 overhead ÷ 2,000 working hours.',
            },
          ],
          fullSum:
            '1,092 hours × $42.25 = $46,137 wages back; $46,137 × 1.3 = $59,978 profit uplift; total = $106,115 / year.',
        },
      },
    ],
    rejected: [
      {
        name: 'Client reporting',
        reason:
          'Promising, but less rule-led and harder to validate as a first workflow.',
      },
    ],
    processMap: {
      title: 'A cleaner path through the close',
      intro:
        'The future state keeps judgement with the team and moves the repetitive checking to the agent.',
      steps: [
        {
          name: 'Collect',
          detail:
            'Bring statements, invoices, and receipts into one working queue.',
          owner: 'Agent',
        },
        {
          name: 'Match',
          detail:
            'Cross-reference transactions against the ledger and client matter.',
          owner: 'Agent',
        },
        {
          name: 'Review',
          detail:
            'A person checks exceptions and resolves anything the rules cannot.',
          owner: 'Agent + person',
        },
        {
          name: 'Approve',
          detail:
            'The responsible finance lead signs off the finished reconciliation pack.',
          owner: 'Person',
        },
      ],
    },
    profitUplift: {
      title: 'Turn repetitive hours into capacity.',
      intro:
        'The dividend is the wage value of hours returned. The uplift is what that recovered capacity can do for the firm.',
      metrics: [
        {
          label: 'Wages you get back',
          value: '$46,137 / yr',
          detail: 'the operational dividend',
        },
        {
          label: 'Profit uplift',
          value: '$59,978 / yr',
          detail: 'capacity redirected into higher-value work',
        },
        {
          label: 'Total financial gain',
          value: '$106,115 / yr',
          detail: 'the combined opportunity',
        },
      ],
    },
    outlook: {
      intro:
        'A staged adoption curve keeps the forecast grounded. It does not assume a perfect launch.',
      years: [
        {
          label: 'Year 1',
          value: '$106,115',
          detail: 'Pilot and first operating year',
        },
        {
          label: 'Year 2',
          value: '$212,230',
          detail: 'Cumulative opportunity at steady state',
        },
        {
          label: 'Year 3',
          value: '$318,345',
          detail: 'Cumulative opportunity with the workflow embedded',
        },
      ],
    },
    costOfDelay: {
      intro:
        'Every month the current process stays in place carries a measurable opportunity cost.',
      value: '$8,843',
      period: 'per month of delay',
      body: 'That is the first-year total financial gain spread across twelve months. Waiting does not keep the opportunity neutral; it gives the work another month to consume the team.',
    },
    roadmap: {
      intro:
        'Start small, measure the real hours returned, then earn the right to expand.',
      phases: [
        {
          name: 'Validate',
          detail:
            'Walk through a month of reconciliations and confirm the assumptions with the people doing the work.',
          when: 'Weeks 1–2',
        },
        {
          name: 'Pilot',
          detail:
            'Run the agent alongside the existing process with a clear exception and approval path.',
          when: 'Weeks 3–6',
        },
        {
          name: 'Scale',
          detail:
            'Compare actual hours returned with the model, then extend to the next workflow.',
          when: 'Weeks 7–10',
        },
      ],
    },
    nextSteps: {
      intro:
        'The next conversation should be practical: inspect the work, test the assumptions, and decide whether the first pilot earns its place.',
      steps: [
        'Bring one recent reconciliation pack and its supporting documents.',
        'Confirm the people, hours, and exception rates behind this model.',
        'Agree the success measure for a six-week pilot.',
      ],
    },
  },
}

// In-memory store for reports generated in V2 sessions before database schema lands.
const inMemoryReports = new Map<string, SavedReport>()
inMemoryReports.set(SAMPLE_SAVED_REPORT.id, SAMPLE_SAVED_REPORT)

export function saveReportInMemory(report: SavedReport): void {
  inMemoryReports.set(report.id, report)
}

export function getReportFromMemory(id: string): SavedReport | undefined {
  return inMemoryReports.get(id.trim())
}

export function resolveSavedReportForPublicView(
  id?: string,
):
  | { status: 'ok'; report: SavedReport; message: string }
  | { status: 'missing'; message: string }
  | { status: 'not-found'; message: string } {
  const cleanedId = typeof id === 'string' ? id.trim() : ''

  if (!cleanedId) {
    return {
      status: 'missing',
      message:
        'This link is missing the report id. Please check the URL and try again.',
    }
  }

  const report = getReportFromMemory(cleanedId)
  if (report) {
    return {
      status: 'ok',
      report,
      message: 'Report loaded.',
    }
  }

  return {
    status: 'not-found',
    message:
      'We could not find this report. The link may be mistyped, the report may have been deleted, or it may have expired.',
  }
}
