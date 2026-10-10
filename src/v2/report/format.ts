// ─────────────────────────────────────────────────────────────────────────────
// format — the Formatter (LYR-203, LYR-242)
//
// The only place in V2 where a number becomes text. It never changes a value:
// the Calculator already rounded every figure, this file adds commas, signs and
// units. about() is the one exception, and it only prints after "about".
//
// A value it can't print as given (NaN, Infinity, an unrounded figure) is our
// bug, so it throws. buildReport() catches it per row (LYR-243, rule P4).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  MiniCalculatorInput,
  MiniCalculatorOutput,
} from '@/src/v2/report/miniCalculator'
import type {
  Figure,
  HoursReturned,
  HoursSpent,
} from '@/src/v2/report/reportModel'

// Calculator figures: whole numbers only, so an unrounded one throws instead of
// being cut to 3 decimals by toLocaleString.
const whole = (n: number, funcName: string) => {
  if (Number.isInteger(n)) {
    return n.toLocaleString('en-US')
  }
  throw new RangeError(
    `${funcName} Expects Real, finite, whole numbers. got: ${n}`,
  )
}

// What the person typed, printed as given: 7.5 hours, 2.5 people (a range).
const given = (n: number, funcName: string) => {
  if (Number.isFinite(n)) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 20 })
  }
  throw new RangeError(`${funcName} Expects a finite number. got: ${n}`)
}

const currencyText = (
  n: number,
  currency: string,
  minDigits: number,
  maxDigits: number,
  funcName: string,
) => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: minDigits,
      maximumFractionDigits: maxDigits,
    }).format(n)
  } catch {
    throw new RangeError(`${funcName} got an unknown currency: ${currency}`)
  }
}

/* No unit on either. v11 prints the unit itself ("TODAY · 3,000 HRS",
   "1,092 hrs/yr"), so a unit here would print twice. */
export const hoursSpent = (n: number) => whole(n, 'hoursSpent') as HoursSpent
export const hoursReturned = (n: number) =>
  whole(n, 'hoursReturned') as HoursReturned

export const count = (n: number) => whole(n, 'count') as Figure
export const percent = (n: number) => `${whole(n, 'percent')}%` as Figure

export const money = (n: number, currency: string) => {
  whole(n, 'money')
  return currencyText(n, currency, 0, 0, 'money') as Figure
}

// The hourly cost: the only figure with cents.
export const rate = (n: number, currency: string) => {
  // n * 100 isn't exact (0.29 * 100 = 28.999…), so round-trip instead.
  if (!Number.isFinite(n) || Math.round(n * 100) / 100 !== n) {
    throw new RangeError(`rate Expects at most two decimals. got: ${n}`)
  }
  return currencyText(n, currency, 2, 2, 'rate') as Figure
}

// Rounds on purpose: "about 7,400", not "about 7,437".
export const about = (n: number) => {
  if (!Number.isFinite(n)) {
    throw new RangeError(`about Expects a finite number. got: ${n}`)
  }
  const abs = Math.abs(n)
  const step = abs >= 10_000 ? 500 : abs >= 1_000 ? 100 : abs >= 100 ? 10 : 1
  return (Math.round(n / step) * step).toLocaleString('en-US') as Figure
}

// Newspaper style: words up to twenty, digits above.
const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
]

// Takes what the person typed, so 7.5 hours prints as "7.5".
export const spelled = (n: number) =>
  (Number.isInteger(n) && n >= 0 && n < NUMBER_WORDS.length
    ? NUMBER_WORDS[n]
    : given(n, 'spelled')) as Figure

// A row's formula: "4 people × 15 hrs × 50 weeks = 3,000 hrs".
export const hoursLine = (
  people: number,
  hoursPerWeek: number,
  weeks: number,
  total: number,
) =>
  `${given(people, 'hoursLine')} ${people === 1 ? 'person' : 'people'} × ${given(hoursPerWeek, 'hoursLine')} hrs × ${whole(weeks, 'hoursLine')} weeks = ${whole(total, 'hoursLine')} hrs` as Figure

// 0.7 → "70%". The ×100 only cleans float noise (0.29 * 100 = 28.999…); a
// fraction that isn't a whole percent is still a Calculator bug and throws.
const fractionAsPercent = (fraction: number, funcName: string) => {
  const pct = fraction * 100
  if (!Number.isFinite(pct) || Math.abs(pct - Math.round(pct)) > 1e-9) {
    throw new RangeError(
      `${funcName} Expects a whole percent. got: ${fraction}`,
    )
  }
  return `${Math.round(pct)}%`
}

export const settingValue = (key: string, value: number) => {
  switch (key) {
    case 'automatable':
    case 'adoption':
    case 'realization':
      return fractionAsPercent(value, 'settingValue') as Figure
    case 'workingWeeks':
      return `${whole(value, 'settingValue')} weeks` as Figure
    case 'overhead':
    case 'profitMultiplier':
      return `${given(value, 'settingValue')}×` as Figure
    default:
      throw new RangeError(`settingValue got an unknown setting: ${key}`)
  }
}

export interface ChainSettings {
  workingWeeks: number
  fteHoursPerWeek: number
  overhead: number
  adoption: number
  realization: number
  profitMultiplier: number
  currency: string
}

// The six calculator lines, word for word as miniCalculator's formulas.
export const chain = (
  input: MiniCalculatorInput,
  out: MiniCalculatorOutput,
  s: ChainSettings,
) => {
  const g = (n: number) => given(n, 'chain')
  g(input.annualPay) // throws on a missing pay; Intl would print "$NaN"
  const pay = currencyText(input.annualPay, s.currency, 0, 2, 'chain')
  const perHour = rate(out.ratePerHour, s.currency)
  const od = money(out.operationalDividend, s.currency)
  const uplift = money(out.profitUplift, s.currency)
  const forTeam = input.team ? ` for ${input.team}` : ''
  return [
    `${g(input.people)} × ${g(input.hoursPerWeek)} × ${g(s.workingWeeks)} = ${count(out.annualHours)} hours/year spent today${forTeam}`,
    `${count(out.annualHours)} × ${fractionAsPercent(out.automatable, 'chain')} × ${g(s.adoption)} × ${g(s.realization)} = ${count(out.hoursReturned)} hours/year returned`,
    `(${pay} ÷ (${g(s.workingWeeks)} × ${g(s.fteHoursPerWeek)})) × ${g(s.overhead)} = ${perHour}/hour`,
    `${count(out.hoursReturned)} × ${perHour} = ${od}`,
    `${od} × ${g(s.profitMultiplier)} = ${uplift}`,
    `${od} + ${uplift} = ${money(out.totalFinancialGain, s.currency)}`,
  ].join('\n') as Figure
}
