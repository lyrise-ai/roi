// Rebuilds the public report from saved interview answers. The calculator owns
// the maths, format.ts owns number-to-text conversion, and this file joins them.

import { link } from '@/src/v2/research/types'
import {
  assembleCalculatorInput,
  bridgePainQuant,
  type BridgedPainFields,
  type SegmentedAnswer,
} from '@/src/v2/report/answerBridge'
import {
  chain,
  count,
  hoursLine,
  hoursReturned,
  hoursSpent,
  money,
  percent,
  settingValue,
  spelled,
} from '@/src/v2/report/format'
import {
  calculateMiniProfitMap,
  SETTINGS,
  type MiniCalculatorOutput,
  type ReportRowNumbers,
} from '@/src/v2/report/miniCalculator'
import type {
  Figure,
  ReportModel,
  ProvenanceKind,
} from '@/src/v2/report/reportModel'
import type {
  SavedReportCompany,
  SavedReportPain,
} from '@/src/v2/report/savedReport'

type BuildReportInput = {
  company: SavedReportCompany
  pains: SavedReportPain[]
  research?: Record<string, unknown>
}

type BuiltRow = {
  position: number
  pain: SavedReportPain
  fields: BridgedPainFields
  numbers: ReportRowNumbers
  calc: MiniCalculatorOutput
  model: ReportModel['workflowRows'][number]
}

const MISSING_QUESTION_LABELS = {
  people: 'how many people do this work',
  hoursPerWeek: 'hours per person each week',
  annualPay: 'annual pay for the people doing this work',
  automatablePct: 'how much of the work can be automated',
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeAnswer = (value: unknown): SegmentedAnswer => {
  if (!isObject(value)) return { mode: 'estimate' }
  if (value.mode === 'exact') {
    return {
      mode: 'exact',
      exact: typeof value.exact === 'string' ? value.exact : undefined,
    }
  }
  if (value.mode === 'range') {
    return {
      mode: 'range',
      low:
        typeof value.low === 'number' || typeof value.low === 'string'
          ? value.low
          : undefined,
      high:
        typeof value.high === 'number' || typeof value.high === 'string'
          ? value.high
          : undefined,
      band: typeof value.band === 'string' ? value.band : undefined,
    }
  }
  return { mode: 'estimate' }
}

const normalizePain = (value: unknown): SavedReportPain | null => {
  if (!isObject(value)) return null
  return {
    text: typeof value.text === 'string' ? value.text : '',
    team: typeof value.team === 'string' ? value.team : undefined,
    worst: typeof value.worst === 'string' ? value.worst : undefined,
    quant: Array.isArray(value.quant) ? value.quant.map(normalizeAnswer) : [],
  }
}

const getEstimates = (research: Record<string, unknown> | undefined) => {
  const estimates = research?.calculatorEstimates
  if (!Array.isArray(estimates)) return []
  return estimates.map((item) => (typeof item === 'string' ? item : undefined))
}

const makeSnapshot = (
  company: SavedReportCompany,
  research: Record<string, unknown> | undefined,
) => {
  const rows = []
  if (company.name) {
    rows.push({
      label: 'Company',
      value: company.name,
      tag: 'Provided by you',
    })
  }
  if (company.website) {
    rows.push({
      label: 'Website',
      value: company.website,
      tag: 'Provided by you',
    })
  }

  const findings = research?.findings
  if (Array.isArray(findings)) {
    findings.forEach((item) => {
      if (!isObject(item) || typeof item.says !== 'string') return
      const source = link(String(item.link ?? ''))
      if (!source) return
      let tag = 'Source'
      try {
        tag = new URL(source).hostname.replace(/^www\./, '')
      } catch {
        return
      }
      rows.push({
        label: typeof item.about === 'string' ? item.about : 'Research',
        value: item.says,
        tag,
        source,
      })
    })
  }
  return rows
}

const describeToday = (fields: BridgedPainFields, team?: string) => {
  const people = fields.people.value
  const hours = fields.hoursPerWeek.value
  if (people === null || hours === null) {
    return team ? `Current process described by ${team}` : 'Current process'
  }
  const subject = team || 'your team'
  return `${spelled(people)} ${people === 1 ? 'person' : 'people'} in ${subject}, ${spelled(hours)} hours a week each`
}

const getProvenance = (fields: BridgedPainFields): ProvenanceKind =>
  Object.values(fields).some(
    (field) => field.source === 'estimate' || field.isRange,
  )
    ? 'estimated'
    : 'given'

const makeAssumptions = (
  fields: BridgedPainFields,
  calc: MiniCalculatorOutput,
): ReportModel['workflowRows'][number]['assumptions'] => [
  {
    name: 'Share a system could take',
    value: settingValue('automatable', calc.automatable),
    why: 'Calculated from the share you said would still need a person.',
    given:
      fields.automatablePct.source === 'user' && !fields.automatablePct.isRange,
  },
  {
    name: 'Team adoption',
    value: settingValue('adoption', SETTINGS.adoption),
    why: 'Assumes the team uses the system for 70% of eligible work.',
    given: false,
  },
  {
    name: 'Realized capacity',
    value: settingValue('realization', SETTINGS.realization),
    why: 'Assumes 80% of freed time turns into usable capacity.',
    given: false,
  },
  {
    name: 'Working year',
    value: settingValue('workingWeeks', SETTINGS.workingWeeks),
    why: 'Allows for leave and public holidays.',
    given: false,
  },
  {
    name: 'Employer cost on top of pay',
    value: settingValue('overhead', SETTINGS.overhead),
    why: 'Adds employer costs to annual pay.',
    given: false,
  },
  {
    name: 'Value of freed capacity',
    value: settingValue('profitMultiplier', SETTINGS.profitMultiplier),
    why: 'Models additional value from using freed capacity on other work.',
    given: false,
  },
]

const makeWorkflowRow = (
  position: number,
  pain: SavedReportPain,
  fields: BridgedPainFields,
): BuiltRow | null => {
  const input = assembleCalculatorInput(fields, pain.team)
  if ('incomplete' in input) return null

  const calc = calculateMiniProfitMap(input, SETTINGS)
  const remaining = calc.annualHours - calc.hoursReturned
  const remainPct =
    calc.annualHours === 0
      ? 0
      : Math.round((remaining / calc.annualHours) * 100)

  // Format every value before accepting this row. Invalid or unrounded
  // calculator output is reported as a failed row rather than printed.
  const formatted = {
    total: hoursSpent(calc.annualHours),
    hours: hoursReturned(calc.hoursReturned),
    remaining: count(remaining),
    remainPct: percent(remainPct),
    gain: money(calc.totalFinancialGain, SETTINGS.currency),
    od: money(calc.operationalDividend, SETTINGS.currency),
    uplift: money(calc.profitUplift, SETTINGS.currency),
    formula: hoursLine(
      input.people,
      input.hoursPerWeek,
      SETTINGS.workingWeeks,
      calc.annualHours,
    ),
    chain: chain(input, calc, SETTINGS),
  }

  return {
    position,
    pain,
    fields,
    calc,
    numbers: {
      position,
      annualHours: calc.annualHours,
      hoursReturned: calc.hoursReturned,
      ratePerHour: calc.ratePerHour,
      operationalDividend: calc.operationalDividend,
      profitUplift: calc.profitUplift,
      totalFinancialGain: calc.totalFinancialGain,
      automatable: calc.automatable,
      remaining,
      remainPct,
      gain: calc.totalFinancialGain,
    },
    model: {
      id: String(position),
      workflow: pain.text || 'Unnamed workflow',
      agent: 'Proposed AI workflow',
      ...formatted,
      today: describeToday(fields, pain.team),
      scope: [
        pain.text,
        pain.worst ? `Main difficulty described: ${pain.worst}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
      assumptions: makeAssumptions(fields, calc),
      mark: getProvenance(fields),
    },
  }
}

const makeProcessMap = (workflow: SavedReportPain | undefined) => {
  if (!workflow) return []
  const team = workflow.team || 'Your team'
  return [
    {
      n: '01',
      step: 'Work begins',
      detail: 'Confirm the trigger and source system with your team.',
      today: team,
      after: 'unchanged' as const,
    },
    {
      n: '02',
      step: 'Repeatable work',
      detail: workflow.text,
      today: team,
      after: 'agent' as const,
    },
    {
      n: '03',
      step: 'Exceptions',
      detail:
        workflow.worst || 'Define exception types during process mapping.',
      today: team,
      after: 'agent-drafts' as const,
    },
    {
      n: '04',
      step: 'Human sign-off',
      detail: 'Agree approval rules before any automated action is enabled.',
      today: team,
      after: 'unchanged' as const,
    },
  ]
}

const makeSections = (hasSnapshot: boolean) => {
  const sections = [
    { ref: 'start', title: 'Recommended starting point', sub: '' },
    {
      ref: 'company',
      title: 'Company snapshot',
      sub: 'Company details provided by you and any verified public findings.',
    },
    { ref: 'workflows', title: 'Proposed AI workflows', sub: '' },
    {
      ref: 'map',
      title: 'Process map',
      sub: 'A draft for validation with your team before implementation.',
    },
    {
      ref: 'uplift',
      title: 'Profit uplift analysis',
      sub: 'Modeled annual capacity returned and its estimated financial value.',
    },
    {
      ref: 'outlook',
      title: 'Three-year outlook',
      sub: 'Cumulative, assuming the same work and annual impact in each year.',
    },
    { ref: 'delay', title: 'Cost of delay', sub: '' },
    {
      ref: 'roadmap',
      title: 'Implementation roadmap',
      sub: 'An indicative sequence. Confirm scope and dates during discovery.',
    },
    { ref: 'next', title: 'Next steps', sub: '' },
  ]
  const visible = hasSnapshot
    ? sections
    : sections.filter((s) => s.ref !== 'company')
  const navLabels = [
    'Starting point',
    'Company',
    'Workflows',
    'Process map',
    'Profit uplift',
    '3-year outlook',
    'Cost of delay',
    'Roadmap',
    'Next steps',
  ]
  return {
    sections: visible,
    nav: visible.map((section) => ({
      label: navLabels[sections.indexOf(section)],
      ref: section.ref,
    })),
  }
}

export function buildReport({
  company,
  pains = [],
  research,
}: BuildReportInput): ReportModel {
  const safeCompany: SavedReportCompany = {
    name:
      isObject(company) && typeof company.name === 'string'
        ? company.name
        : 'Your company',
    website:
      isObject(company) && typeof company.website === 'string'
        ? company.website
        : undefined,
  }
  const safePains = Array.isArray(pains)
    ? pains.map(normalizePain).filter((pain): pain is SavedReportPain => !!pain)
    : []
  const safeResearch = isObject(research) ? research : undefined
  const estimates = getEstimates(safeResearch)
  const fields = safePains.map((pain) => bridgePainQuant(pain.quant, estimates))
  const failedRows: NonNullable<ReportModel['failedRows']> = []
  const builtRows: BuiltRow[] = []

  safePains.forEach((pain, position) => {
    try {
      const row = makeWorkflowRow(position, pain, fields[position])
      if (row) {
        builtRows.push(row)
        return
      }
      const assembled = assembleCalculatorInput(fields[position], pain.team)
      const missing = 'missing' in assembled ? assembled.missing : []
      failedRows.push({
        workflow: pain.text || 'Unnamed workflow',
        message: `Add ${missing.map((key) => MISSING_QUESTION_LABELS[key]).join(', ')} to calculate this workflow.`,
      })
    } catch {
      failedRows.push({
        workflow: pain.text || 'Unnamed workflow',
        message:
          'We could not calculate this workflow from the saved answers. Review its numeric inputs.',
      })
    }
  })

  builtRows.sort((a, b) => {
    if (b.numbers.gain !== a.numbers.gain) {
      return b.numbers.gain - a.numbers.gain
    }
    if (b.numbers.hoursReturned !== a.numbers.hoursReturned) {
      return b.numbers.hoursReturned - a.numbers.hoursReturned
    }
    return a.position - b.position
  })

  const snapshot = makeSnapshot(safeCompany, safeResearch)
  const sections = makeSections(snapshot.length > 0)
  const top = builtRows[0]
  const sum = (selector: (row: BuiltRow) => number) =>
    builtRows.reduce((total, row) => total + selector(row), 0)

  let totalsFailed: string | undefined
  let totalHours: ReportModel['totalHours']
  let totalGain: Figure | undefined
  let totalOd: Figure | undefined
  let totalUplift: Figure | undefined
  let odPct: Figure | undefined
  let upliftPct: Figure | undefined
  let outlook: ReportModel['outlook']
  let delayMonthly: Figure | undefined

  if (builtRows.length === 0) {
    totalsFailed =
      'No workflows have enough readable numeric inputs to calculate a total. Complete the missing answers and build a new report.'
  } else {
    try {
      const totalHoursNumber = sum((row) => row.numbers.hoursReturned)
      const totalOdNumber = sum((row) => row.numbers.operationalDividend)
      const totalUpliftNumber = sum((row) => row.numbers.profitUplift)
      const totalGainNumber = sum((row) => row.numbers.totalFinancialGain)
      if (
        ![
          totalHoursNumber,
          totalOdNumber,
          totalUpliftNumber,
          totalGainNumber,
        ].every(Number.isFinite)
      ) {
        throw new RangeError('Report totals are not finite.')
      }

      totalHours = hoursReturned(totalHoursNumber)
      totalGain = money(totalGainNumber, SETTINGS.currency)
      totalOd = money(totalOdNumber, SETTINGS.currency)
      totalUplift = money(totalUpliftNumber, SETTINGS.currency)
      const odShare =
        totalGainNumber === 0
          ? 0
          : Math.round((totalOdNumber / totalGainNumber) * 100)
      odPct = percent(odShare)
      upliftPct = percent(100 - odShare)
      outlook = [1, 2, 3].map((year) => {
        const total = totalGainNumber * year
        const od = totalOdNumber * year
        return {
          total: money(total, SETTINGS.currency),
          label: year === 1 ? 'Year 1' : `Through year ${year}`,
          heightPct: percent(Math.round((year / 3) * 100)),
          odPct: percent(total === 0 ? 0 : Math.round((od / total) * 100)),
          upliftPct: percent(
            total === 0 ? 100 : 100 - Math.round((od / total) * 100),
          ),
        }
      })
      delayMonthly = money(Math.round(totalOdNumber / 12), SETTINGS.currency)
    } catch {
      totalsFailed =
        'We could not calculate the report totals from these answers. Review the numeric inputs and build a new report.'
      totalHours = undefined
      totalGain = undefined
      totalOd = undefined
      totalUplift = undefined
      odPct = undefined
      upliftPct = undefined
      outlook = undefined
      delayMonthly = undefined
    }
  }

  const confirm = safePains.flatMap((pain, position) => {
    const fieldSet = fields[position]
    const fieldNames: [keyof BridgedPainFields, string][] = [
      ['people', 'People doing the work'],
      ['hoursPerWeek', 'Hours per person each week'],
      ['annualPay', 'Annual pay'],
      ['automatablePct', 'Share that can be automated'],
    ]
    return fieldNames
      .filter(([key]) => {
        const field = fieldSet[key]
        return field.source === 'estimate' || field.isRange
      })
      .map(([, label]) => ({
        item: `${label}: ${pain.text || 'Unnamed workflow'}`,
        note: 'This value is estimated or a range midpoint. Confirm it before relying on the total.',
      }))
  })

  return {
    thesis: top
      ? `Start with ${top.pain.text}. It has the largest modeled annual financial gain among workflows with complete inputs: ${top.model.gain}.`
      : 'The starting point will be clear once at least one workflow has complete, readable numeric inputs.',
    snapshot,
    workflowsSub:
      'Workflows are ranked by modeled annual financial gain. Open a row to see the assumptions and calculation.',
    workflowRows: builtRows.map((row) => row.model),
    totalsLabel: `Totals across ${builtRows.length} calculated workflow${builtRows.length === 1 ? '' : 's'}`,
    totalHours,
    totalGain,
    failedRows,
    ...(totalsFailed ? { totalsFailed } : {}),
    rejected: [],
    mapTitle: top?.pain.text || safePains[0]?.text || 'Workflow process',
    processMap: makeProcessMap(top?.pain || safePains[0]),
    levers: builtRows.map((row) => ({
      label: row.pain.text || 'Unnamed workflow',
      from: row.pain.team || 'Workflow',
      value: money(row.numbers.profitUplift, SETTINGS.currency),
    })),
    totalOd,
    totalUplift,
    odPct,
    upliftPct,
    outlook,
    delayMonthly,
    delayCopy:
      'Modeled operational savings left unrealized each month. This uses the wage savings only, not the additional profit uplift.',
    roadmap: [
      {
        weeks: 'Weeks 1–2',
        phase: 'Confirm the map',
        detail:
          'Validate the workflow, volumes, exception paths, and baseline with the people who do the work.',
      },
      {
        weeks: 'Weeks 2–3',
        phase: 'Define the agent',
        detail:
          'Agree which repeatable steps can be supported, what stays with a person, and how success will be measured.',
      },
      {
        weeks: 'Weeks 3–5',
        phase: 'Build and connect',
        detail:
          'Configure the proposed workflow and connect only the approved systems and data.',
      },
      {
        weeks: 'Week 6',
        phase: 'Measure against the baseline',
        detail:
          'Review the first results against the agreed baseline before expanding the scope.',
      },
    ],
    nextCopy:
      'Review the answers and assumptions below, then confirm the process map with the people who do this work. Final scope and expected results should be agreed only after that validation.',
    journey: [
      'Review this Profit Map',
      'Confirm the workflow and baseline',
      'Define the proposed agent',
      'Build and test',
      'Measure before expanding',
    ].map((label, index) => ({ n: String(index + 1), label })),
    guaranteeCopy:
      'This report is a model, not a delivery commitment or guarantee. Validate the inputs, scope, access, and measurement method before making an investment decision.',
    confirmSub:
      'These answers are estimated or use a range midpoint. They can move the result and should be confirmed with your team.',
    confirm,
    sections: sections.sections,
    nav: sections.nav,
    legend:
      'Figures marked estimated use an estimate or range midpoint. Unmarked inputs came from your answers.',
    disclaimer:
      'Modeled estimates based on saved interview answers and stated assumptions. Validate inputs before using these figures to make a decision.',
  }
}
