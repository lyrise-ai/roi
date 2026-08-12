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
// TODO: confirm 1.30 (modeler prompt) vs 1.25 (design mock) with team
const PROFIT_MULTIPLIER = 1.3

export interface MiniCalculatorInput {
  people: number
  hoursPerWeek: number
  // Fully-loaded assumption applied below (OVERHEAD_MULTIPLIER) — pass the
  // raw annual salary, not an already-loaded rate.
  annualPay: number
  automatablePct: number // 0–1
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

export function calculateMiniProfitMap(
  input: MiniCalculatorInput,
): MiniCalculatorOutput {
  const { people, hoursPerWeek, annualPay, automatablePct, team } = input

  const annualHours = people * hoursPerWeek * WORKING_WEEKS
  const hoursReturned = annualHours * automatablePct * ADOPTION * REALIZATION
  const ratePerHour = (annualPay / (WORKING_WEEKS * 40)) * OVERHEAD_MULTIPLIER
  const operationalDividend = hoursReturned * ratePerHour
  const profitUplift = operationalDividend * PROFIT_MULTIPLIER
  const totalFinancialGain = operationalDividend + profitUplift

  const forTeam = team ? ` for ${team}` : ''

  return {
    annualHours: round(annualHours),
    hoursReturned: round(hoursReturned),
    ratePerHour: Math.round(ratePerHour * 100) / 100,
    operationalDividend: round(operationalDividend),
    profitUplift: round(profitUplift),
    totalFinancialGain: round(totalFinancialGain),
    formulas: {
      annualHours: `${people} × ${hoursPerWeek} × ${WORKING_WEEKS} = ${comma(annualHours)} hours/year spent today${forTeam}`,
      hoursReturned: `${comma(annualHours)} × ${automatablePct} × ${ADOPTION} × ${REALIZATION} = ${comma(hoursReturned)} hours/year returned`,
      ratePerHour: `($${comma(annualPay)} ÷ (${WORKING_WEEKS} × 40)) × ${OVERHEAD_MULTIPLIER} = $${ratePerHour.toFixed(2)}/hour`,
      operationalDividend: `${comma(hoursReturned)} × $${ratePerHour.toFixed(2)} = ${money(operationalDividend)}`,
      profitUplift: `${money(operationalDividend)} × ${PROFIT_MULTIPLIER} = ${money(profitUplift)}`,
      totalFinancialGain: `${money(operationalDividend)} + ${money(profitUplift)} = ${money(totalFinancialGain)}`,
    },
  }
}
