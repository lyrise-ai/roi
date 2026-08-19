// ─────────────────────────────────────────────────────────────────────────────
// answerBridge — Profit Map POC (LYR-188 / POC 10)
//
// The interview (pages/v2/index.jsx) stores each pain point's five number
// questions as raw SegmentedInput values — {mode:'exact', exact}, {mode:'range',
// low, high} or {mode:'estimate'} — none of them numbers. miniCalculator.ts
// wants plain numbers. This is the seam between the two: it never fabricates a
// number for a field the user didn't give one for, so the reveal can decide
// what to show (and mark with ProvenanceMark) instead of silently getting a 0.
//
// Positional mapping, matching QUANT in pages/v2/index.jsx exactly:
//   quant[0] = volume/month   — not read here; miniCalculator has no field for it
//   quant[1] = people
//   quant[2] = hours/week, each
//   quant[3] = annual pay
//   quant[4] = "how much would still need a person" after automation
//
// Pure: no I/O, no imports outside this file. Runs in the browser or in Node.
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentedAnswer =
  | { mode: 'exact'; exact?: string }
  | { mode: 'range'; low?: string; high?: string }
  | { mode: 'estimate' }

export interface BridgedField {
  value: number | null
  isEstimated: boolean
  // 'user' is the only non-null source today. There is no research-inference
  // fallback yet (POC 9 / LYR-187 area, Yousef) — when it lands, an
  // 'estimate' answer can resolve to a real source instead of staying null.
  source: 'user' | null
}

const MISSING: BridgedField = { value: null, isEstimated: false, source: null }

// Strips the formatting these free-text fields actually see in practice
// (currency signs, thousands commas, a percent sign, a k/m suffix) and reads
// the rest as a plain number. It does not parse words ("a third", "half") —
// QUANT's placeholders show that style for the automatable question, so a
// user who types words rather than a number or a "%" is read as missing
// here, same as an empty field.
function parseNumeric(raw: string | undefined): number | null {
  if (raw == null) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const match = trimmed
    .replace(/[$,]/g, '')
    .match(/^(-?\d*\.?\d+)\s*(%|k|m)?$/i)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n)) return null
  const suffix = match[2]?.toLowerCase()
  if (suffix === 'k') return n * 1_000
  if (suffix === 'm') return n * 1_000_000
  return n // '%' is left as-is: toFraction() in miniCalculator already treats anything above 1 as percentage points
}

// Converts one SegmentedInput answer into a flagged, calculator-ready field.
// - 'exact': the typed number, or missing if empty/unparseable.
// - 'range': the average of low/high; either bound alone is used as-is.
//   TODO: 'average' chosen per team decision (Amany/Yousef); revisit if they
//   want conservative/low instead.
// - 'estimate': the user gave no number. Flagged as estimated, value stays
//   null rather than inventing one — see the `source` comment above.
export function bridgeAnswer(
  answer: SegmentedAnswer | undefined,
): BridgedField {
  if (!answer) return MISSING
  switch (answer.mode) {
    case 'exact': {
      const value = parseNumeric(answer.exact)
      return value === null
        ? MISSING
        : { value, isEstimated: false, source: 'user' }
    }
    case 'range': {
      const low = parseNumeric(answer.low)
      const high = parseNumeric(answer.high)
      if (low === null && high === null) return MISSING
      if (low === null)
        return { value: high, isEstimated: false, source: 'user' }
      if (high === null)
        return { value: low, isEstimated: false, source: 'user' }
      return { value: (low + high) / 2, isEstimated: false, source: 'user' }
    }
    case 'estimate':
      return { value: null, isEstimated: true, source: null }
    default:
      return MISSING
  }
}

// quant[4] asks how much STILL needs a person after automation — the
// opposite quantity from the calculator's automatablePct (the share
// automation removes). This inverts it in whatever units the user answered
// in: a fraction stays a fraction (1 − x), and anything read as percentage
// points (miniCalculator's own >1-means-points convention) is inverted the
// same way (100 − x), so the result can be handed to the calculator as-is.
//
// TODO: CONFIRM WITH YOUSEF — inverting per Q4's wording ("how much still
// needs a person"), but the interview file's own header comment (line ~414)
// says this field "becomes automatable% downstream" with no inversion
// mentioned. This feeds every dollar figure the reveal shows; get this
// confirmed before POC 10 ships.
export function bridgeAutomatable(
  answer: SegmentedAnswer | undefined,
): BridgedField {
  const field = bridgeAnswer(answer)
  if (field.value === null) return field
  const inverted =
    field.value <= 1 ? 1 - field.value : Math.max(0, 100 - field.value)
  return { ...field, value: inverted }
}

export interface BridgedPainFields {
  people: BridgedField
  hoursPerWeek: BridgedField
  annualPay: BridgedField
  automatablePct: BridgedField
}

// quant[0] (volume/month) is intentionally not in the return value —
// miniCalculator's MiniCalculatorInput has no field for it.
export function bridgePainQuant(
  quant: SegmentedAnswer[] = [],
): BridgedPainFields {
  return {
    people: bridgeAnswer(quant[1]),
    hoursPerWeek: bridgeAnswer(quant[2]),
    annualPay: bridgeAnswer(quant[3]),
    automatablePct: bridgeAutomatable(quant[4]),
  }
}

export interface CalculatorReadyInput {
  people: number
  hoursPerWeek: number
  annualPay: number
  automatablePct: number
  team?: string
}

export interface IncompleteFields {
  incomplete: true
  missing: Array<keyof BridgedPainFields>
}

const REQUIRED_FIELDS = [
  'people',
  'hoursPerWeek',
  'annualPay',
  'automatablePct',
] as const

// Assembles the four bridged fields into the calculator's input shape, but
// only when every one of them resolved to a real number. A field left as
// null (blank, or 'estimate' with no fallback yet) must never become a 0 fed
// into the calculator — that would silently understate the figures — so an
// incomplete set is signalled instead, letting the reveal choose what to do
// (show hours-spent only, hedge, or ask for the missing field).
export function assembleCalculatorInput(
  fields: BridgedPainFields,
  team?: string,
): CalculatorReadyInput | IncompleteFields {
  const missing = REQUIRED_FIELDS.filter((key) => fields[key].value === null)
  if (missing.length > 0) return { incomplete: true, missing }

  return {
    people: fields.people.value as number,
    hoursPerWeek: fields.hoursPerWeek.value as number,
    annualPay: fields.annualPay.value as number,
    automatablePct: fields.automatablePct.value as number,
    ...(team ? { team } : {}),
  }
}
