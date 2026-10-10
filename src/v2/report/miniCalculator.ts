// ─────────────────────────────────────────────────────────────────────────────
// miniCalculator — The Calculator (LYR-186, LYR-204)
//
// All the maths in the report, and nothing else.
// Numbers go in and numbers come out. It never produces text.
// Turning a number into "$46,137" belongs to the Formatter (LYR-242).
// Putting figures into the report belongs to the Assembler (LYR-243).
// It uses no AI.
//
// Pure: no database, no network, no clock, nothing random.
// Maths in JavaScript never throws: a bad value just becomes NaN and flows
// through every figure built from it.
// ─────────────────────────────────────────────────────────────────────────────

import {
  assembleCalculatorInput,
  bridgePainQuant,
  type BridgedPainFields,
  type SegmentedAnswer,
} from '@/src/v2/report/answerBridge'

export interface CalculatorSettings {
  workingWeeks: number // leave and holidays (50)
  fteHoursPerWeek: number // a full week, to turn yearly pay into hourly (40)
  overhead: number // salary plus what an employer pays on top (1.3)
  adoption: number // teams don't use a new system for every case in year one (0.7)
  realization: number // freed hours don't turn into value one for one (0.8)
  profitMultiplier: number // uplift = dividend × 1.3, an extra on top (1.3)
  currency: string // one currency per report ('USD')
}

export const SETTINGS: CalculatorSettings = {
  workingWeeks: 50,
  fteHoursPerWeek: 40,
  overhead: 1.3,
  adoption: 0.7,
  realization: 0.8,
  profitMultiplier: 1.3,
  currency: 'USD',
}

export interface MiniCalculatorInput {
  people: number
  hoursPerWeek: number
  // Pass the plain yearly salary. We add benefits and overhead ourselves,
  // below, using overhead multiplier.
  annualPay: number
  // Either 0 to 1, or 0 to 100. Anything above 1 is read as a percentage. We
  // then force it into the 0 to 1 range and round it to a whole percent.
  automatablePct: number
  team?: string
}

export interface MiniCalculatorOutput {
  annualHours: number // hours SPENT today — never conflate with hoursReturned
  hoursReturned: number // hours automation frees up — never conflate with annualHours
  ratePerHour: number
  operationalDividend: number
  profitUplift: number
  totalFinancialGain: number
  automatable: number // the fraction actually used, after rounding; chain() prints it
}

const round = (n: number) => Math.round(n)

// The fifth answer arrives as either 0.4 or 40, depending on how the person
// wrote it, so we read anything above 1 as a percentage. We round to a whole
// percent because that is how it is shown on screen, and the formula we print
// has to be the one we actually used.
const toFraction = (n: number) => {
  const fraction = n > 1 ? n / 100 : n
  return Math.min(1, Math.max(0, Math.round(fraction * 100) / 100))
}

export function calculateMiniProfitMap(
  input: MiniCalculatorInput,
  settings: CalculatorSettings = SETTINGS,
): MiniCalculatorOutput {
  const { people, hoursPerWeek, annualPay } = input
  const automatable = toFraction(input.automatablePct)

  // We round at every step, not only at the end. These same numbers are
  // printed in the formula lines (format.chain()), so a prospect checking the maths by
  // hand has to reach the number we printed. Being consistent on screen beats
  // being exact to more decimal places — see the LYR-186 review.
  const annualHours = round(people * hoursPerWeek * settings.workingWeeks)
  const hoursReturned = round(
    annualHours * automatable * settings.adoption * settings.realization,
  )
  const ratePerHour =
    round(
      (annualPay / (settings.workingWeeks * settings.fteHoursPerWeek)) *
        settings.overhead *
        100,
    ) / 100
  const operationalDividend = round(hoursReturned * ratePerHour)
  const profitUplift = round(operationalDividend * settings.profitMultiplier)
  const totalFinancialGain = operationalDividend + profitUplift

  return {
    annualHours,
    hoursReturned,
    ratePerHour,
    operationalDividend,
    profitUplift,
    totalFinancialGain,
    automatable,
  }
}

export type MissingQuestion =
  | 'people'
  | 'hoursPerWeek'
  | 'annualPay'
  | 'automatablePct'

export interface SkippedPain {
  pain: number
  question: MissingQuestion
}

export interface ReportRowNumbers {
  position: number
  annualHours: number
  hoursReturned: number
  ratePerHour: number
  operationalDividend: number
  profitUplift: number
  totalFinancialGain: number
  automatable: number
  remaining: number
  remainPct: number
  gain: number
}

export interface OutlookYearNumbers {
  total: number
  od: number
  uplift: number
  heightPct: number
  odPct: number
  upliftPct: number
}

export interface ReportNumbers {
  rows: ReportRowNumbers[]
  order: number[]
  skipped: SkippedPain[]
  totalHours: number
  totalOd: number
  totalUplift: number
  totalGain: number
  odPct: number
  upliftPct: number
  outlook: OutlookYearNumbers[]
  delayMonthly: number
}

export interface CalculateReportInput {
  pains: BridgedPainFields[]
  rejected?: number[]
  settings?: CalculatorSettings
}

/* The one ranking: biggest gain first, then more hours returned, then the
   order they were asked in. A NaN gain sorts last. */
type Ranked = { gain: number; hoursReturned: number; position: number }
function byRank(a: Ranked, b: Ranked): number {
  const aNan = !Number.isFinite(a.gain)
  const bNan = !Number.isFinite(b.gain)
  if (aNan !== bNan) return aNan ? 1 : -1
  if (!aNan && b.gain !== a.gain) return b.gain - a.gain
  if (!aNan && b.hoursReturned !== a.hoursReturned) {
    return b.hoursReturned - a.hoursReturned
  }
  return a.position - b.position
}

export function calculateReport(input: CalculateReportInput): ReportNumbers {
  const { pains = [], rejected = [] } = input
  const settings = input.settings ?? SETTINGS

  const rows: ReportRowNumbers[] = []
  const skipped: SkippedPain[] = []

  const REQUIRED_KEYS: MissingQuestion[] = [
    'people',
    'hoursPerWeek',
    'annualPay',
    'automatablePct',
  ]

  for (let i = 0; i < pains.length; i++) {
    if (rejected.includes(i)) {
      continue
    }
    const pain = pains[i]
    if (!pain) continue

    const missingKeys: MissingQuestion[] = []
    for (const key of REQUIRED_KEYS) {
      if (pain[key] == null || pain[key].value === null) {
        missingKeys.push(key)
      }
    }

    if (missingKeys.length > 0) {
      for (const q of missingKeys) {
        skipped.push({ pain: i, question: q })
      }
      continue
    }

    const calc = calculateMiniProfitMap(
      {
        people: pain.people.value as number,
        hoursPerWeek: pain.hoursPerWeek.value as number,
        annualPay: pain.annualPay.value as number,
        automatablePct: pain.automatablePct.value as number,
      },
      settings,
    )

    const remaining = calc.annualHours - calc.hoursReturned
    const remainPct = round((remaining / calc.annualHours) * 100)
    const gain = calc.totalFinancialGain

    rows.push({
      position: i,
      annualHours: calc.annualHours,
      hoursReturned: calc.hoursReturned,
      ratePerHour: calc.ratePerHour,
      operationalDividend: calc.operationalDividend,
      profitUplift: calc.profitUplift,
      totalFinancialGain: calc.totalFinancialGain,
      automatable: calc.automatable,
      remaining,
      remainPct,
      gain,
    })
  }

  rows.sort(byRank)

  const order = rows.map((r) => r.position)

  const totalHours = rows.reduce((acc, r) => acc + r.hoursReturned, 0)
  const totalOd = rows.reduce((acc, r) => acc + r.operationalDividend, 0)
  const totalUplift = rows.reduce((acc, r) => acc + r.profitUplift, 0)
  const totalGain = rows.reduce((acc, r) => acc + r.totalFinancialGain, 0)

  let odPct: number
  let upliftPct: number
  if (!Number.isFinite(totalGain) || totalGain === 0) {
    if (!Number.isFinite(totalGain)) {
      odPct = NaN
      upliftPct = NaN
    } else {
      odPct = 0
      upliftPct = 100
    }
  } else {
    odPct = round((totalOd / totalGain) * 100)
    upliftPct = 100 - odPct
  }

  const y3Total = totalGain * 3
  const outlook: OutlookYearNumbers[] = [1, 2, 3].map((m) => {
    const yTotal = totalGain * m
    const yOd = totalOd * m
    const yUplift = totalUplift * m
    let yHeightPct: number
    let yOdPct: number
    let yUpliftPct: number

    if (!Number.isFinite(y3Total) || y3Total === 0) {
      if (!Number.isFinite(y3Total)) {
        yHeightPct = NaN
        yOdPct = NaN
        yUpliftPct = NaN
      } else {
        yHeightPct = 0
        yOdPct = 0
        yUpliftPct = 100
      }
    } else {
      yHeightPct = round((yTotal / y3Total) * 100)
      if (yTotal === 0) {
        yOdPct = 0
        yUpliftPct = 100
      } else {
        yOdPct = round((yOd / yTotal) * 100)
        yUpliftPct = 100 - yOdPct
      }
    }

    return {
      total: yTotal,
      od: yOd,
      uplift: yUplift,
      heightPct: yHeightPct,
      odPct: yOdPct,
      upliftPct: yUpliftPct,
    }
  })

  const delayMonthly = round(totalOd / 12)

  return {
    rows,
    order,
    skipped,
    totalHours,
    totalOd,
    totalUplift,
    totalGain,
    odPct,
    upliftPct,
    outlook,
    delayMonthly,
  }
}

export interface PainItem {
  text?: string
  team?: string
  worst?: string
  quant?: SegmentedAnswer[]
}

export interface FeaturedResult {
  pain: PainItem
  index: number
  figures: {
    complete: boolean
    calc: MiniCalculatorOutput | { annualHours: number } | null
  }
}

export function figuresFor(
  pain: PainItem | undefined,
  estimates: (string | undefined)[] = [],
  settings: CalculatorSettings = SETTINGS,
) {
  if (!pain) return { complete: false, calc: null }
  const fields = bridgePainQuant(pain.quant, estimates)
  const assembled = assembleCalculatorInput(fields, pain.team || undefined)

  if (!('incomplete' in assembled)) {
    return {
      complete: true,
      calc: calculateMiniProfitMap(assembled, settings),
    }
  }
  if (fields.people.value === null || fields.hoursPerWeek.value === null) {
    return { complete: false, calc: null }
  }
  const calc = calculateMiniProfitMap(
    {
      people: fields.people.value,
      hoursPerWeek: fields.hoursPerWeek.value,
      annualPay: 0,
      automatablePct: 0,
    },
    settings,
  )
  return { complete: false, calc: { annualHours: calc.annualHours } }
}

export function selectFeatured(
  pains: PainItem[] = [],
  estimates: (string | undefined)[] = [],
  settings: CalculatorSettings = SETTINGS,
): FeaturedResult | undefined {
  const ranked = (x) => {
    const calc = x.figures.calc as MiniCalculatorOutput
    return {
      gain: calc.totalFinancialGain,
      hoursReturned: calc.hoursReturned,
      position: x.index,
    }
  }
  return pains
    .map((pain, index) => ({
      pain,
      index,
      figures: figuresFor(pain, estimates, settings),
    }))
    .sort((a, b) => {
      // A pain with every answer beats one still missing an answer.
      if (a.figures.complete !== b.figures.complete) {
        return a.figures.complete ? -1 : 1
      }
      return a.figures.complete
        ? byRank(ranked(a), ranked(b))
        : a.index - b.index
    })[0]
}
