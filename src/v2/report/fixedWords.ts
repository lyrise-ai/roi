// Text that's the same on every report (LYR-209). Wording lives here, never in
// the Assembler or a screen. Taken from v11 until 209 approves the final copy.

import type { MissingQuestion } from '@/src/v2/report/miniCalculator'

type SettingKey =
  | 'automatable'
  | 'adoption'
  | 'realization'
  | 'workingWeeks'
  | 'overhead'
  | 'profitMultiplier'

export const ASSUMPTION_WHY: Record<SettingKey, { name: string; why: string }> =
  {
    automatable: {
      name: 'Share a system could take',
      why: 'What you told us still needs a person.',
    },
    adoption: {
      name: 'Take-up in year one',
      why: 'Teams rarely use a new system for every case in year one.',
    },
    realization: {
      name: 'Share of the saving that lands',
      why: 'Freed hours do not turn into value one for one.',
    },
    workingWeeks: {
      name: 'Weeks worked a year',
      why: 'Fifty-two, less leave and public holidays.',
    },
    overhead: {
      name: 'Cost on top of salary',
      why: 'What an employer pays on top of pay: tax, benefits, space.',
    },
    profitMultiplier: {
      name: 'What a freed hour earns on top',
      why: 'Freed hours go onto billable work, which earns more than the wage it saves.',
    },
  }

// the order the assumptions show in, after "Share a system could take"
export const SHARED_SETTINGS: SettingKey[] = [
  'adoption',
  'realization',
  'workingWeeks',
  'overhead',
  'profitMultiplier',
]

export const CONFIRM_NOTE = {
  range:
    'You gave a range, so we used the middle. Your real figure moves this.',
  estimate: 'We estimated this one. Your real figure moves this.',
  missing: 'We need this one to work the row out.',
}

export const THESIS_FALLBACK = (workflow: string) =>
  `Start with ${workflow}. It is where the most hours come back.`

export const OUTLOOK_LABELS = ['Year 1', 'Through year 2', 'Through year 3']

export const ROADMAP_PHASES = [
  { weeks: 'Weeks 1–2', phase: 'Confirm the map' },
  { weeks: 'Weeks 2–3', phase: 'Define the agents' },
  { weeks: 'Weeks 3–5', phase: 'Build and connect' },
  { weeks: 'Week 6', phase: 'Measure against the baseline' },
]

export const JOURNEY = [
  'Profit Map',
  'Confirm it in a process-mapping session',
  'Define the agents',
  'Build and deploy',
  'Measure against the baseline',
]

export const GUARANTEE =
  'We customise the agents to how your team already works and tie the commitment to the result. Conditions travel with it: agreed scope, a baseline validated in process mapping, the access we need, what your side owns, and an agreed way of measuring.'

export const LEGEND =
  'Solid values are yours. Anything marked carries its source.'

export const DISCLAIMER =
  'An estimate built from the figures you gave us. Not financial advice. Check it before you commit.'

export const ROW_FAILED =
  "We couldn't work this one out from your answers. Try building the report again, and contact us if it keeps happening."

export const TOTALS_FAILED =
  "We couldn't add up the totals from these answers. Try building the report again, and contact us if it keeps happening."

const MISSING: Record<MissingQuestion, string> = {
  people: 'how many people do it',
  hoursPerWeek: 'their hours a week',
  annualPay: 'their pay',
  automatablePct: 'how much still needs a person',
}

const CONFIRM_ITEM: Record<MissingQuestion, string> = {
  people: 'People',
  hoursPerWeek: 'Hours a week',
  annualPay: 'Pay',
  automatablePct: 'Share that still needs a person',
}

const NUMBERS = ['no', 'one', 'two', 'three', 'four', 'five', 'six']

export const LABELS = {
  totals: (rows: number) =>
    rows === 1
      ? 'Total, for one workflow'
      : `Totals, across ${NUMBERS[rows] ?? rows} workflows`,
  noRows:
    "None of the work you named has every answer it needs yet. Fill in what's missing and build the report again.",
  noRowsThesis:
    'The starting point shows once one piece of work has every answer it needs.',
  rowMissing: (questions: MissingQuestion[]) =>
    `Add ${questions.map((q) => MISSING[q]).join(', ')} to work this one out.`,
  confirmItem: (question: MissingQuestion, workflow: string) =>
    `${CONFIRM_ITEM[question]}: ${workflow}`,
  confirmSub:
    'What this map assumes about you. Each one can move the numbers, and each one is an agenda item for the session.',
  ownSite: 'Your site',
  sections: [
    { ref: 'start', title: 'Recommended starting point', sub: '' },
    {
      ref: 'company',
      title: 'Company snapshot',
      sub: 'What we could verify before we asked you anything.',
    },
    { ref: 'workflows', title: 'Proposed AI workflows', sub: '' },
    {
      ref: 'map',
      title: 'Process map',
      sub: 'Your top workflow, one run, start to finish. Who does each step today, and who does it after.',
    },
    {
      ref: 'uplift',
      title: 'Profit uplift analysis',
      sub: 'Where the freed hours go, and what they earn there.',
    },
    {
      ref: 'outlook',
      title: 'Three-year outlook',
      sub: 'Cumulative, assuming you keep the team and the work keeps coming.',
    },
    { ref: 'delay', title: 'Cost of delay', sub: '' },
    {
      ref: 'roadmap',
      title: 'Implementation roadmap',
      sub: 'Six weeks on the first agent. The others wait until it holds.',
    },
    { ref: 'next', title: 'Next steps', sub: '' },
  ],
  nav: [
    { label: 'Starting point', ref: 'start' },
    { label: 'Company', ref: 'company' },
    { label: 'Workflows', ref: 'workflows' },
    { label: 'Process map', ref: 'map' },
    { label: 'Profit uplift', ref: 'uplift' },
    { label: '3-year outlook', ref: 'outlook' },
    { label: 'Cost of delay', ref: 'delay' },
    { label: 'Roadmap', ref: 'roadmap' },
    { label: 'Next steps', ref: 'next' },
  ],
}

// Labels on the report screen (src/ui/report/Report.jsx).
export const SCREEN = {
  hoursBack: 'Hours back',
  annualGain: 'Annual gain',
  viewDetails: 'View details',
  hideDetails: 'Hide details',
  today: 'Today',
  after: 'After',
  scope: 'Scope',
  hoursToday: 'Hours today',
  staysWithPerson: 'Hours that stay with a person',
  staysWithPersonAria: (pct: string) => `${pct} of hours stay with a person`,
  wagesBack: 'Wages you get back',
  operationalDividend: 'the operational dividend',
  freedTimeEarns: 'What the freed time earns',
  splitAria: (od: string, uplift: string) =>
    `${od} wages you get back, ${uplift} what the freed time earns`,
  multipliedBy: 'WHAT WE MULTIPLIED BY',
  afterStep: {
    agent: 'Agent',
    'agent-drafts': 'Agent drafts; person reviews',
    unchanged: 'Unchanged',
  },
  sectionsNav: 'Report sections',
  jumpToSection: 'Jump to section',
  jumpToSectionAria: 'Jump to report section',
}
