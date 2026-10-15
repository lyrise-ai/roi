// ─────────────────────────────────────────────────────────────────────────────
// sampleReport — one complete report, with everything it was built from
// (LYR-203)
//
// Lets screen work start before any generation exists: the report screen
// (LYR-208) will draw SAMPLE_REPORT on pages/ui-kit.jsx. Later, the Assembler's
// test (LYR-243) feeds SAMPLE_ANSWERS, SAMPLE_RESEARCH and SAMPLE_WORDS into
// buildReport() and checks it gives back exactly SAMPLE_REPORT.
//
// Every figure below came from running calculateMiniProfitMap
// (miniCalculator.ts) on SAMPLE_ANSWERS, then was written in as fixed text.
// This file must never call the calculator. If it did, it would need its own
// formatting code, and LYR-243's test would be comparing the calculator with
// itself, which proves nothing.
//
// The firm is the one in SAMPLE_SAVED_REPORT (savedReport.ts): Acme Legal
// Services. It named four pieces of work. Three became rows, ranked by gain.
// The fourth, fee quotes, was left out. Client intake's pay was given as a
// range, so that row is marked `estimated`.
//
// The fixed text (headings, journey, guarantee, assumption names and reasons)
// comes from fixedWords.ts (LYR-209).
// ─────────────────────────────────────────────────────────────────────────────

import { link, type Research } from '@/src/v2/research/types'
import {
  ASSUMPTION_WHY,
  DISCLAIMER,
  GUARANTEE,
  JOURNEY,
  LABELS,
  LEGEND,
  ROADMAP_PHASES,
} from '@/src/v2/report/fixedWords'
import { hoursReturned, hoursSpent } from '@/src/v2/report/format'
import type {
  Figure,
  ReportModel,
  ReportWords,
} from '@/src/v2/report/reportModel'
import type {
  SavedReportCompany,
  SavedReportPain,
} from '@/src/v2/report/savedReport'

/* Sample data only. A Figure is text only format.ts may make, and most of its
   functions arrive with LYR-242. Until then these literals stand in for what
   it will produce; LYR-243's test fails if any of them is wrong. */
const f = (text: string) => text as Figure

const exact = (value: string) => ({ mode: 'exact' as const, exact: value })

/* The interview answers. Each pain's `quant` is its five answers, in the order
   answerBridge.ts reads them: times a month, people, hours a week each, pay,
   and how much would still need a person. */
export const SAMPLE_ANSWERS: {
  company: SavedReportCompany
  pains: SavedReportPain[]
} = {
  company: { name: 'Acme Legal Services', website: 'acmelegal.com' },
  pains: [
    {
      text: 'Reconciling client trust accounts and cross-referencing invoice disbursements',
      team: 'Finance & Compliance',
      worst: 'Chasing missing receipts at the end of each billing cycle',
      quant: [
        exact('12'),
        exact('4'),
        exact('15'),
        exact('65000'),
        exact('35'),
      ],
    },
    {
      text: 'Typing each new client intake form into practice management, billing and the client portal',
      team: 'Operations',
      worst: 'Entering the same address three times',
      quant: [
        exact('200'),
        exact('3'),
        exact('10'),
        { mode: 'range', low: '50000', high: '60000' },
        exact('30'),
      ],
    },
    {
      text: 'Putting together the weekly status report for each client',
      worst: 'Copying dates out of the case system by hand',
      quant: [exact('4'), exact('1'), exact('8'), exact('70000'), exact('15')],
    },
    {
      text: 'Writing fee quotes for new matters',
      team: 'Partners',
      worst: 'Working out the scope before we know the matter',
      quant: [exact('40'), exact('2'), exact('5'), exact('90000'), exact('80')],
    },
  ],
}

/* What research found. Three findings, each with a link the research agent
   opened. The snapshot rows below are copied from these, in this order. */
export const SAMPLE_RESEARCH: Research = {
  findings: [
    {
      says: '38 people across three offices, four of them in finance and compliance',
      about: 'size',
      link: link('https://acmelegal.com/team'),
    },
    {
      says: 'Commercial property, private client and employment work',
      about: 'services',
      link: link('https://acmelegal.com/services'),
    },
    {
      says: 'Hiring a finance assistant whose first listed duty is trust account reconciliation',
      about: 'hiring',
      link: link(
        'https://www.linkedin.com/jobs/view/acme-legal-finance-assistant',
      ),
      quote:
        'Reconcile client trust accounts monthly and chase outstanding receipts.',
    },
  ],
  handWork: [
    'Trust accounts are reconciled by hand every month',
    'Client details are entered into more than one system',
  ],
  gaps: [],
  confidence: 'lots',
  tried: [],
}

/* What the report agent wrote. `pain` points at SAMPLE_ANSWERS.pains. */
export const SAMPLE_WORDS: ReportWords = {
  noticed:
    'Four people in finance spend about 3,000 hours a year reconciling trust accounts, and the finance assistant you are hiring would be asked to do the same.',
  thesis:
    'Start with trust account reconciliation. Four people spend 15 hours a week each matching disbursements to invoices by hand, and the finance assistant you are hiring now would inherit the same job. It is rule-bound work with a clear right answer, which makes it the fastest to automate and the easiest to measure. The other two wait until this one holds.',
  workflowsSub:
    'Three of the four pieces of work you named. Open any row for the before-and-after and the arithmetic.',
  workflows: [
    {
      pain: 0,
      workflow: 'Trust account reconciliation',
      agent: 'a reconciliation agent',
      today: '4 people in finance, 15 hours a week each',
      scope:
        'Matches each disbursement to its invoice and client ledger, and flags the ones that do not reconcile. A person clears the flags and signs off the month.',
    },
    {
      pain: 1,
      workflow: 'Client intake re-keying',
      agent: 'an intake agent',
      today: '3 people in operations, 10 hours a week each',
      scope:
        'Takes a completed intake form and enters it into practice management, billing and the client portal. Drafts the conflict check; a person signs it off.',
    },
    {
      pain: 2,
      workflow: 'Weekly client status reports',
      agent: 'a reporting agent',
      today: '1 person, most of a day each week',
      scope:
        'Assembles each weekly status report from your case system. A person reviews it before it goes out.',
    },
  ],
  rejected: [
    {
      pain: 3,
      reason:
        'we looked at this and left it out. The quote depends on how you read the matter, and that judgment is what the client pays for.',
    },
  ],
  mapTitle: 'Trust account reconciliation',
  processMap: [
    {
      step: 'Bank statement arrives',
      detail: 'monthly, for each client account',
      today: 'finance team',
      after: 'unchanged',
    },
    {
      step: 'Match each payment to its invoice',
      detail: 'where most of the hours go',
      today: 'finance team',
      after: 'agent',
    },
    {
      step: 'Match disbursements to client ledgers',
      detail: 'the same data, checked in a second place',
      today: 'finance team',
      after: 'agent',
    },
    {
      step: 'Chase missing receipts',
      detail: 'the part everyone dreads',
      today: 'finance team',
      after: 'agent-drafts',
    },
    {
      step: 'Clear what does not reconcile',
      detail: 'the exceptions',
      today: 'finance team',
      after: 'agent-drafts',
    },
    {
      step: 'Sign off the month',
      detail: 'the compliance judgment',
      today: 'head of finance',
      after: 'unchanged',
    },
  ],
  levers: [
    { pain: 0, label: 'Month-end close without the reconciliation backlog' },
    { pain: 1, label: 'More new matters opened without adding staff' },
    { pain: 2, label: 'Fee earners stop assembling reports by hand' },
  ],
  delayCopy:
    'Every month this stays manual, four people spend another 250 hours matching receipts by hand. Delay is not neutral. It carries a monthly price, and this is it.',
  roadmap: [
    'Sit with the finance team, map reconciliation as it actually runs, and settle the pay range for intake.',
    'Agree what the reconciliation agent does alone, what it drafts, and what stays with a person.',
    'The agent drafts every match and a person approves each one. Accuracy is reported weekly against the manual baseline.',
    'Hours back measured against week one. The other two workflows go in scope only if this one held.',
  ],
  nextCopy:
    "One working session. We map reconciliation together, settle the assumptions marked in this report, and write the agent's scope of work. Your own open items are the agenda.",
  confirmNotes: [
    {
      key: '1:annualPay',
      note: 'you gave a range of $50,000 to $60,000, so we used the middle. Your payroll knows the real figure.',
    },
  ],
}

/* The assumptions every row shares, after its own "how much can be automated". */
const SHARED_ASSUMPTIONS = [
  { ...ASSUMPTION_WHY.adoption, value: f('70%'), given: false },
  { ...ASSUMPTION_WHY.realization, value: f('80%'), given: false },
  { ...ASSUMPTION_WHY.workingWeeks, value: f('50 weeks'), given: false },
  { ...ASSUMPTION_WHY.overhead, value: f('1.3×'), given: false },
  { ...ASSUMPTION_WHY.profitMultiplier, value: f('1.3×'), given: false },
]

const automatable = (value: string) => ({
  ...ASSUMPTION_WHY.automatable,
  value: f(value),
  given: true,
})

export const SAMPLE_REPORT: ReportModel = {
  thesis: SAMPLE_WORDS.thesis,

  snapshot: [
    {
      label: 'size',
      value:
        '38 people across three offices, four of them in finance and compliance',
      tag: 'Your site',
      source: link('https://acmelegal.com/team'),
    },
    {
      label: 'services',
      value: 'Commercial property, private client and employment work',
      tag: 'Your site',
      source: link('https://acmelegal.com/services'),
    },
    {
      label: 'hiring',
      value:
        'Hiring a finance assistant whose first listed duty is trust account reconciliation',
      tag: 'linkedin.com',
      source: link(
        'https://www.linkedin.com/jobs/view/acme-legal-finance-assistant',
      ),
    },
  ],

  workflowsSub: SAMPLE_WORDS.workflowsSub,
  workflowRows: [
    {
      id: '0',
      workflow: 'Trust account reconciliation',
      agent: 'a reconciliation agent',
      total: hoursSpent(3000),
      hours: hoursReturned(1092),
      remaining: f('1,908'),
      remainPct: f('64%'),
      gain: f('$106,115'),
      od: f('$46,137'),
      uplift: f('$59,978'),
      today: '4 people in finance, 15 hours a week each',
      scope:
        'Matches each disbursement to its invoice and client ledger, and flags the ones that do not reconcile. A person clears the flags and signs off the month.',
      formula: f('4 people × 15 hrs × 50 weeks = 3,000 hrs'),
      chain: f(
        '4 × 15 × 50 = 3,000 hours/year spent today for Finance & Compliance\n3,000 × 65% × 0.7 × 0.8 = 1,092 hours/year returned\n($65,000 ÷ (50 × 40)) × 1.3 = $42.25/hour\n1,092 × $42.25 = $46,137\n$46,137 × 1.3 = $59,978\n$46,137 + $59,978 = $106,115',
      ),
      assumptions: [automatable('65%'), ...SHARED_ASSUMPTIONS],
      mark: 'given',
    },
    {
      id: '1',
      workflow: 'Client intake re-keying',
      agent: 'an intake agent',
      total: hoursSpent(1500),
      hours: hoursReturned(588),
      remaining: f('912'),
      remainPct: f('61%'),
      gain: f('$48,348'),
      od: f('$21,021'),
      uplift: f('$27,327'),
      today: '3 people in operations, 10 hours a week each',
      scope:
        'Takes a completed intake form and enters it into practice management, billing and the client portal. Drafts the conflict check; a person signs it off.',
      formula: f('3 people × 10 hrs × 50 weeks = 1,500 hrs'),
      chain: f(
        '3 × 10 × 50 = 1,500 hours/year spent today for Operations\n1,500 × 70% × 0.7 × 0.8 = 588 hours/year returned\n($55,000 ÷ (50 × 40)) × 1.3 = $35.75/hour\n588 × $35.75 = $21,021\n$21,021 × 1.3 = $27,327\n$21,021 + $27,327 = $48,348',
      ),
      assumptions: [automatable('70%'), ...SHARED_ASSUMPTIONS],
      // pay was given as a range ($50,000 to $60,000), so the row is estimated
      mark: 'estimated',
    },
    {
      id: '2',
      workflow: 'Weekly client status reports',
      agent: 'a reporting agent',
      total: hoursSpent(400),
      hours: hoursReturned(190),
      remaining: f('210'),
      remainPct: f('53%'),
      gain: f('$19,884'),
      od: f('$8,645'),
      uplift: f('$11,239'),
      today: '1 person, most of a day each week',
      scope:
        'Assembles each weekly status report from your case system. A person reviews it before it goes out.',
      formula: f('1 person × 8 hrs × 50 weeks = 400 hrs'),
      chain: f(
        '1 × 8 × 50 = 400 hours/year spent today\n400 × 85% × 0.7 × 0.8 = 190 hours/year returned\n($70,000 ÷ (50 × 40)) × 1.3 = $45.50/hour\n190 × $45.50 = $8,645\n$8,645 × 1.3 = $11,239\n$8,645 + $11,239 = $19,884',
      ),
      assumptions: [automatable('85%'), ...SHARED_ASSUMPTIONS],
      mark: 'given',
    },
  ],
  totalsLabel: LABELS.totals(3),
  failedRows: [],
  totals: {
    ok: true,
    hours: hoursReturned(1870),
    gain: f('$174,347'),
    od: f('$75,803'),
    uplift: f('$98,544'),
    odPct: f('43%'),
    upliftPct: f('57%'),
    outlook: [
      {
        total: f('$174,347'),
        label: 'Year 1',
        heightPct: f('33%'),
        odPct: f('43%'),
        upliftPct: f('57%'),
      },
      {
        total: f('$348,694'),
        label: 'Through year 2',
        heightPct: f('67%'),
        odPct: f('43%'),
        upliftPct: f('57%'),
      },
      {
        total: f('$523,041'),
        label: 'Through year 3',
        heightPct: f('100%'),
        odPct: f('43%'),
        upliftPct: f('57%'),
      },
    ],
    delayMonthly: f('$6,317'),
  },
  rejected: [
    {
      workflow: 'Writing fee quotes for new matters',
      reason: SAMPLE_WORDS.rejected[0].reason,
    },
  ],

  mapTitle: SAMPLE_WORDS.mapTitle,
  processMap: SAMPLE_WORDS.processMap.map((p, i) => ({
    n: String(i + 1).padStart(2, '0'),
    ...p,
  })),

  levers: [
    {
      label: 'Month-end close without the reconciliation backlog',
      from: 'Trust account reconciliation',
      value: f('$59,978'),
    },
    {
      label: 'More new matters opened without adding staff',
      from: 'Client intake re-keying',
      value: f('$27,327'),
    },
    {
      label: 'Fee earners stop assembling reports by hand',
      from: 'Weekly client status reports',
      value: f('$11,239'),
    },
  ],
  delayCopy: SAMPLE_WORDS.delayCopy,

  roadmap: ROADMAP_PHASES.map((phase, i) => ({
    ...phase,
    detail: SAMPLE_WORDS.roadmap[i],
  })),

  nextCopy: SAMPLE_WORDS.nextCopy,
  journey: JOURNEY.map((label, i) => ({ n: String(i + 1), label })),
  guaranteeCopy: GUARANTEE,
  confirmSub: LABELS.confirmSub,
  confirm: [
    {
      item: 'Pay: Client intake re-keying',
      note: SAMPLE_WORDS.confirmNotes[0].note,
    },
  ],

  sections: LABELS.sections,
  nav: LABELS.nav,
  legend: LEGEND,
  disclaimer: DISCLAIMER,
}
