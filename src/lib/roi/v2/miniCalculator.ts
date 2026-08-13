// ─────────────────────────────────────────────────────────────────────────────
// miniCalculator — Profit Map POC (LYR-186 / POC 8)
//
// Deliberately standalone from src/lib/roi/pipeline/roiCalculator.ts. That
// calculator models volume × minutes-per-item across workflows and is tied
// to the full ReportState pipeline; this is a throwaway POC surface with its
// own, much simpler people × hours-per-week shape. It owes the old pipeline
// nothing — no shared types, no shared code path — but it does reuse a
// handful of production's tuning constants (see each constant's comment for
// where it came from) so the POC's numbers land in the same neighborhood as
// a real report would produce.
//
// Pure function: no I/O, no imports beyond this file, safe to call from the
// browser or from Node.
// ─────────────────────────────────────────────────────────────────────────────

// Reused from production — src/lib/roi/agent.ts:762 and :1493, the fallback
// adoptionRate applied to a workflow before the modeler LLM has produced its
// own per-workflow adoption estimate.
const ADOPTION = 0.7

// Reused from production — src/lib/roi/prompts/roiModeler.ts:109 instructs
// the modeler to pick a realizationFactor in 0.70–0.85; 0.8 is the same
// midpoint value src/lib/roi/devMockReport.ts:151 uses as its default.
const REALIZATION = 0.8

// Reused from production — src/lib/roi/prompts/roiModeler.ts:107: "50 for
// US/EU/UK" (the prompt uses 48 for GCC/Egypt instead).
// TODO: swap to 48 if this POC is being pitched at a GCC/Egypt prospect.
const WORKING_WEEKS = 50

// Reused from production — src/lib/roi/prompts/roiModeler.ts:85, the
// fully-loaded multiplier the modeler applies to raw pay to account for
// benefits, payroll tax, and overhead before treating it as a billing rate.
const OVERHEAD_MULTIPLIER = 1.3

// Not a production value — POC-only. See LYR-186.
// Applied as an INCREMENTAL multiplier here (uplift = OD × this), which is not
// what production's globals.profitMultiplier means: that one is a TOTAL
// multiplier of 1.8–4.0 (roiModeler.ts:110) applied as OD × (m − 1)
// (roiCalculator.ts:363). 1.3 incremental sits inside production's implied
// 0.8–3.0 incremental band, so don't "fix" this by copying 1.8–4.0 in.
const PROFIT_MULTIPLIER = 1.3

// Full-time hours per week — the denominator that turns an annual salary into
// an hourly rate. Not the same thing as the user's hoursPerWeek input, which is
// how much of their week the workflow eats.
const FTE_HOURS_PER_WEEK = 40

export interface MiniCalculatorInput {
  people: number
  hoursPerWeek: number
  // Fully-loaded assumption applied below (OVERHEAD_MULTIPLIER) — pass the
  // raw annual salary, not an already-loaded rate.
  annualPay: number
  // 0–1, or 0–100 percentage points — anything above 1 is read as points.
  // Clamped to 0–1 and rounded to a whole percent before it's used.
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

// Every input is user-typed and every one of them can be missing mid-interview
// (the live preview renders before the last question is answered). A missing or
// junk number becomes 0 — a $0 line reads as "not answered yet", a $NaN line
// reads as a broken app in front of a prospect.
const num = (n: number) => (Number.isFinite(n) ? Number(n) : 0)

// Q4 answers arrive as either 0.4 or 40 depending on how the question was
// phrased, so treat anything above 1 as percentage points. Rounded to a whole
// percent because that's how it's displayed, and the shown formula has to be
// the one that was actually computed.
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

  // Rounded at every step, not just at the end: these figures are also the
  // operands of the formula strings below, and a prospect who checks the
  // arithmetic by hand must get the same answer we printed. Presentable and
  // self-consistent beats exact — see LYR-186 review.
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
