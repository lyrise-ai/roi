// ─────────────────────────────────────────────────────────────────────────────
// miniCalculator — Profit Map POC (LYR-186 / POC 8)
//
// Kept separate from src/lib/roi/pipeline/roiCalculator.ts on purpose. That one
// works in volume × minutes per item across many workflows, and is wired into
// the whole live report pipeline. This one is a throwaway POC with a much
// simpler shape: people × hours a week.
//
// It shares no types and no code with the live calculator. It does reuse a few
// of the live system's tuning numbers — each constant below says where it came
// from — so the POC's figures land in roughly the same range a real report
// would give.
//
// Nothing here reads a file or calls a server, and it imports nothing. Safe to
// run in the browser or in Node.
// ─────────────────────────────────────────────────────────────────────────────

// Taken from the live system — src/lib/roi/agent.ts:762 and :1493. How much of
// a team we assume actually uses the new system. This is the default we apply
// before the model has worked out its own number for a given workflow.
const ADOPTION = 0.7

// Taken from the live system. How much of the saving really lands in practice.
// src/lib/roi/prompts/roiModeler.ts:109 tells the model to pick something
// between 0.70 and 0.85; 0.8 is the middle, and the same default
// src/lib/roi/devMockReport.ts:151 uses.
const REALIZATION = 0.8

// Working weeks in a year. Taken from the live system —
// src/lib/roi/prompts/roiModeler.ts:107 says "50 for US/EU/UK", and 48 for the
// Gulf and Egypt.
// TODO: switch to 48 if this POC is being shown to a Gulf or Egypt prospect.
const WORKING_WEEKS = 50

// Taken from the live system — src/lib/roi/prompts/roiModeler.ts:85. Salary is
// not what an employee actually costs. This multiplier adds benefits, payroll
// tax and overhead on top of raw pay before we treat it as an hourly cost.
const OVERHEAD_MULTIPLIER = 1.3

// POC-only number, not from the live system. See LYR-186.
//
// Careful: here it is an EXTRA multiplier — uplift = dividend × 1.3. The live
// system's profitMultiplier means something different: it is a TOTAL of 1.8 to
// 4.0 (roiModeler.ts:110), applied as dividend × (m − 1)
// (roiCalculator.ts:363). Written as an extra, the live range works out to
// roughly 0.8 to 3.0 — and 1.3 sits inside that. So do not "fix" this by
// copying 1.8–4.0 across.
const PROFIT_MULTIPLIER = 1.3

// A full working week. We divide a yearly salary by this to get an hourly
// cost. Do not confuse it with the user's hoursPerWeek answer, which is how
// much of their week this one task eats.
const FTE_HOURS_PER_WEEK = 40

export interface MiniCalculatorInput {
  people: number
  hoursPerWeek: number
  // Pass the plain yearly salary. We add benefits and overhead ourselves,
  // below, using OVERHEAD_MULTIPLIER.
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
  formulas: {
    annualHours: string
    hoursReturned: string
    ratePerHour: string
    operationalDividend: string
    profitUplift: string
    totalFinancialGain: string
  }
}

const round = (n: number) => Math.round(n)
const comma = (n: number) => round(n).toLocaleString('en-US')
const money = (n: number) => `$${comma(n)}`

// Every input here was typed by a user, and any of them can still be missing
// while they are answering (the preview draws before the last question is
// done). So anything missing or unreadable becomes 0. A line showing $0 reads
// as "not answered yet"; a line showing $NaN reads as a broken app in front of
// a prospect.
const num = (n: number) => (Number.isFinite(n) ? Number(n) : 0)

// The fifth answer arrives as either 0.4 or 40, depending on how the person
// wrote it, so we read anything above 1 as a percentage. We round to a whole
// percent because that is how it is shown on screen, and the formula we print
// has to be the one we actually used.
const toFraction = (n: number) => {
  const raw = num(n)
  const fraction = raw > 1 ? raw / 100 : raw
  return Math.min(1, Math.max(0, Math.round(fraction * 100) / 100))
}

export function calculateMiniProfitMap(
  input: MiniCalculatorInput,
): MiniCalculatorOutput {
  const { team } = input
  const people = num(input.people)
  const hoursPerWeek = num(input.hoursPerWeek)
  const annualPay = num(input.annualPay)
  const automatable = toFraction(input.automatablePct)

  // We round at every step, not only at the end. These same numbers are
  // printed in the formula lines below, so a prospect checking the maths by
  // hand has to reach the number we printed. Being consistent on screen beats
  // being exact to more decimal places — see the LYR-186 review.
  const annualHours = round(people * hoursPerWeek * WORKING_WEEKS)
  const hoursReturned = round(
    annualHours * automatable * ADOPTION * REALIZATION,
  )
  const ratePerHour =
    round(
      (annualPay / (WORKING_WEEKS * FTE_HOURS_PER_WEEK)) *
        OVERHEAD_MULTIPLIER *
        100,
    ) / 100
  const operationalDividend = round(hoursReturned * ratePerHour)
  const profitUplift = round(operationalDividend * PROFIT_MULTIPLIER)
  const totalFinancialGain = operationalDividend + profitUplift

  const forTeam = team ? ` for ${team}` : ''
  const pct = `${round(automatable * 100)}%`
  const rate = `$${ratePerHour.toFixed(2)}`

  return {
    annualHours,
    hoursReturned,
    ratePerHour,
    operationalDividend,
    profitUplift,
    totalFinancialGain,
    formulas: {
      annualHours: `${people} × ${hoursPerWeek} × ${WORKING_WEEKS} = ${comma(annualHours)} hours/year spent today${forTeam}`,
      hoursReturned: `${comma(annualHours)} × ${pct} × ${ADOPTION} × ${REALIZATION} = ${comma(hoursReturned)} hours/year returned`,
      ratePerHour: `(${money(annualPay)} ÷ (${WORKING_WEEKS} × ${FTE_HOURS_PER_WEEK})) × ${OVERHEAD_MULTIPLIER} = ${rate}/hour`,
      operationalDividend: `${comma(hoursReturned)} × ${rate} = ${money(operationalDividend)}`,
      profitUplift: `${money(operationalDividend)} × ${PROFIT_MULTIPLIER} = ${money(profitUplift)}`,
      totalFinancialGain: `${money(operationalDividend)} + ${money(profitUplift)} = ${money(totalFinancialGain)}`,
    },
  }
}
