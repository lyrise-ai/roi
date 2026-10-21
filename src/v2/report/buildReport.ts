// The Assembler (LYR-243): saved answers in, one ReportModel out. The
// Calculator does the maths, format.ts makes the text, fixedWords.ts holds the
// wording. This file only joins them, and never throws.

import { link } from '@/src/v2/research/types'
import {
  assembleCalculatorInput,
  bridgePainQuant,
  type BridgedField,
  type BridgedPainFields,
  type SegmentedAnswer,
} from '@/src/v2/report/answerBridge'
import { cleanDomain } from '@/src/v2/report/domain'
import {
  ASSUMPTION_WHY,
  CONFIRM_NOTE,
  DISCLAIMER,
  GUARANTEE,
  JOURNEY,
  LABELS,
  LEGEND,
  OUTLOOK_LABELS,
  ROADMAP_PHASES,
  ROW_FAILED,
  SHARED_SETTINGS,
  THESIS_FALLBACK,
  TOTALS_FAILED,
} from '@/src/v2/report/fixedWords'
import {
  chain,
  count,
  hoursLine,
  hoursReturned,
  hoursSpent,
  money,
  percent,
  settingValue,
} from '@/src/v2/report/format'
import {
  calculateReport,
  SETTINGS,
  type CalculatorSettings,
  type MissingQuestion,
  type ReportNumbers,
  type ReportRowNumbers,
} from '@/src/v2/report/miniCalculator'
import type {
  After,
  ProvenanceKind,
  ReportModel,
  ReportWords,
  Totals,
} from '@/src/v2/report/reportModel'
import type { ReportCompany, ReportPain } from '@/src/v2/report/savedReport'

type BuildReportInput = {
  company: ReportCompany
  pains: ReportPain[]
  research?: Record<string, unknown>
  words?: Partial<ReportWords> | null
  settings?: Record<string, unknown> | null
}

type Row = ReportModel['workflowRows'][number]

const QUESTIONS: MissingQuestion[] = [
  'people',
  'hoursPerWeek',
  'annualPay',
  'automatablePct',
]
const AFTER: After[] = ['agent', 'agent-drafts', 'unchanged']
const SURE: ProvenanceKind[] = ['given', 'estimated', 'benchmarked']

// Saved rows are JSON anyone could have shaped: check every field before use.
const isObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (value: unknown) => (typeof value === 'string' ? value : '')
const list = (value: unknown) =>
  Array.isArray(value) ? value.filter(isObject) : []
const isIndex = (value: unknown, pains: unknown[]) =>
  Number.isInteger(value) &&
  (value as number) >= 0 &&
  (value as number) < pains.length

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

const normalizePain = (value: unknown): ReportPain | null => {
  if (!isObject(value)) return null
  return {
    text: text(value.text),
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

// The report's own saved settings, so a reopened report keeps its numbers.
// Anything missing or odd falls back to today's SETTINGS.
const readSettings = (value: unknown): CalculatorSettings => {
  if (!isObject(value) || typeof value.currency !== 'string') return SETTINGS
  const numbers = Object.keys(SETTINGS).filter((key) => key !== 'currency')
  const valid = numbers.every(
    (key) => Number.isFinite(value[key]) && value[key] > 0,
  )
  return valid ? { ...SETTINGS, ...value } : SETTINGS
}

// typed = given, a range = estimated, our estimate = benchmarked
const markOf = (field: BridgedField): ProvenanceKind =>
  field.isRange
    ? 'estimated'
    : field.source === 'estimate'
      ? 'benchmarked'
      : 'given'

// the least certain answer sets the row's mark
const rowMark = (fields: BridgedPainFields): ProvenanceKind =>
  SURE[Math.max(...QUESTIONS.map((q) => SURE.indexOf(markOf(fields[q]))))]

// At most six findings, each pointing at a page research really opened.
const makeSnapshot = (
  company: ReportCompany,
  research: Record<string, unknown> | undefined,
) => {
  const own = cleanDomain(company.website)
  return list(research?.findings)
    .map((item) => {
      const source = link(text(item.link))
      if (!source || !text(item.says)) return null
      const host = new URL(source).hostname.replace(/^www\./, '')
      const ours = own && (host === own || host.endsWith(`.${own}`))
      return {
        label: text(item.about),
        value: text(item.says),
        tag: ours ? LABELS.ownSite : host,
        source,
      }
    })
    .filter(Boolean)
    .slice(0, 6)
}

const makeTotals = (numbers: ReportNumbers, currency: string): Totals => ({
  ok: true,
  hours: hoursReturned(numbers.totalHours),
  gain: money(numbers.totalGain, currency),
  od: money(numbers.totalOd, currency),
  uplift: money(numbers.totalUplift, currency),
  odPct: percent(numbers.odPct),
  upliftPct: percent(numbers.upliftPct),
  outlook: numbers.outlook.map((year, i) => ({
    total: money(year.total, currency),
    label: OUTLOOK_LABELS[i],
    heightPct: percent(year.heightPct),
    odPct: percent(year.odPct),
    upliftPct: percent(year.upliftPct),
  })),
  delayMonthly: money(numbers.delayMonthly, currency),
})

export function buildReport({
  company,
  pains = [],
  research,
  words,
  settings,
}: BuildReportInput): ReportModel {
  const safeCompany: ReportCompany = {
    name: isObject(company)
      ? text(company.name) || 'Your company'
      : 'Your company',
    website:
      isObject(company) && typeof company.website === 'string'
        ? company.website
        : undefined,
  }
  const safePains = Array.isArray(pains)
    ? pains.map(normalizePain).filter((pain): pain is ReportPain => !!pain)
    : []
  const safeResearch = isObject(research) ? research : undefined
  const w: Record<string, any> = isObject(words) ? words : {}
  const s = readSettings(settings)
  const estimates = getEstimates(safeResearch)
  const fields = safePains.map((pain) => bridgePainQuant(pain.quant, estimates))

  // the AI's words per pain; no words for a pain means it's named with its own text
  const said = new Map(
    list(w.workflows)
      .filter((item) => isIndex(item.pain, safePains))
      .map((item) => [item.pain as number, item]),
  )
  const nameOf = (pain: number) =>
    text(said.get(pain)?.workflow) || safePains[pain]?.text || ''
  const rejected = list(w.rejected).filter((item) =>
    isIndex(item.pain, safePains),
  )

  const numbers = calculateReport({
    pains: fields,
    rejected: rejected.map((item) => item.pain as number),
    settings: s,
  })

  const makeRow = (row: ReportRowNumbers): Row => {
    const pain = safePains[row.position]
    const input = assembleCalculatorInput(fields[row.position], pain.team)
    if ('incomplete' in input) throw new Error('row has missing inputs')
    const automatable = fields[row.position].automatablePct
    return {
      id: String(row.position),
      workflow: nameOf(row.position),
      agent: text(said.get(row.position)?.agent),
      total: hoursSpent(row.annualHours),
      hours: hoursReturned(row.hoursReturned),
      remaining: count(row.remaining),
      remainPct: percent(row.remainPct),
      gain: money(row.gain, s.currency),
      od: money(row.operationalDividend, s.currency),
      uplift: money(row.profitUplift, s.currency),
      today: text(said.get(row.position)?.today),
      scope: text(said.get(row.position)?.scope),
      formula: hoursLine(
        input.people,
        input.hoursPerWeek,
        s.workingWeeks,
        row.annualHours,
      ),
      chain: chain(input, row, s),
      assumptions: [
        {
          ...ASSUMPTION_WHY.automatable,
          value: settingValue('automatable', row.automatable),
          given: automatable.source === 'user' && !automatable.isRange,
        },
        ...SHARED_SETTINGS.map((key) => ({
          ...ASSUMPTION_WHY[key],
          value: settingValue(key, s[key]),
          given: false,
        })),
      ],
      mark: rowMark(fields[row.position]),
    }
  }

  // Rows in the Calculator's order. Each fails on its own.
  const workflowRows: Row[] = []
  const failedRows: ReportModel['failedRows'] = []
  for (const row of numbers.rows) {
    try {
      workflowRows.push(makeRow(row))
    } catch {
      failedRows.push({ workflow: nameOf(row.position), message: ROW_FAILED })
    }
  }
  const brokenRows = failedRows.length

  const missing = new Map<number, MissingQuestion[]>()
  for (const { pain, question } of numbers.skipped) {
    missing.set(pain, [...(missing.get(pain) ?? []), question])
  }
  for (const [pain, questions] of missing) {
    failedRows.push({
      workflow: nameOf(pain),
      message: LABELS.rowMissing(questions),
    })
  }

  // Totals must add up from the rows on screen, so one broken row fails them.
  let totals: Totals
  if (numbers.rows.length === 0) {
    totals = { ok: false, message: LABELS.noRows }
  } else if (brokenRows > 0) {
    totals = { ok: false, message: TOTALS_FAILED }
  } else {
    try {
      totals = makeTotals(numbers, s.currency)
    } catch {
      totals = { ok: false, message: TOTALS_FAILED }
    }
  }

  const notes = new Map(
    list(w.confirmNotes).map((item) => [text(item.key), text(item.note)]),
  )
  const isRejected = new Set(rejected.map((item) => item.pain as number))
  const confirm = safePains.flatMap((_, pain) =>
    isRejected.has(pain)
      ? []
      : QUESTIONS.flatMap((question) => {
          const field = fields[pain][question]
          const kind =
            field.value === null
              ? 'missing'
              : field.isRange
                ? 'range'
                : field.source === 'estimate'
                  ? 'estimate'
                  : null
          if (!kind) return []
          return [
            {
              item: LABELS.confirmItem(question, nameOf(pain)),
              note: notes.get(`${pain}:${question}`) || CONFIRM_NOTE[kind],
            },
          ]
        }),
  )

  const top = workflowRows[0]
  const roadmap = Array.isArray(w.roadmap) ? w.roadmap : []

  return {
    thesis:
      text(w.thesis) ||
      (top ? THESIS_FALLBACK(top.workflow) : LABELS.noRowsThesis),
    snapshot: makeSnapshot(safeCompany, safeResearch),
    workflowsSub: text(w.workflowsSub),
    workflowRows,
    totalsLabel: LABELS.totals(workflowRows.length),
    failedRows,
    totals,
    rejected: rejected.map((item) => ({
      workflow: safePains[item.pain as number].text,
      reason: text(item.reason),
    })),
    mapTitle: text(w.mapTitle),
    processMap: list(w.processMap).map((step, i) => ({
      n: String(i + 1).padStart(2, '0'),
      step: text(step.step),
      detail: text(step.detail),
      today: text(step.today),
      after: AFTER.includes(step.after) ? step.after : 'unchanged',
    })),
    levers: list(w.levers).flatMap((lever) => {
      const row = workflowRows.find((r) => r.id === String(lever.pain))
      return row
        ? [{ label: text(lever.label), from: row.workflow, value: row.uplift }]
        : []
    }),
    delayCopy: text(w.delayCopy),
    roadmap: ROADMAP_PHASES.map((phase, i) => ({
      ...phase,
      detail: text(roadmap[i]),
    })),
    nextCopy: text(w.nextCopy),
    journey: JOURNEY.map((label, i) => ({ n: String(i + 1), label })),
    guaranteeCopy: GUARANTEE,
    confirmSub: LABELS.confirmSub,
    confirm,
    sections: LABELS.sections,
    nav: LABELS.nav,
    legend: LEGEND,
    disclaimer: DISCLAIMER,
  }
}
