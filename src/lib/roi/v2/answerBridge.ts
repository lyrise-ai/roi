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
  // 'user' is what the prospect typed. 'estimate' is the canned figure the
  // interview already showed them for that question (DEMOS[].quant[].estimate
  // in pages/v2/index.jsx) standing in for a blank — POC-only, see
  // parseEstimateText below. There is still no research-inference fallback
  // (POC 9 / LYR-187 area, Yousef); when it lands it replaces the canned
  // source, not the flag.
  source: 'user' | 'estimate' | null
}

const MISSING: BridgedField = { value: null, isEstimated: false, source: null }

// TODO(agent) — LYR-XXX, the rule for every free-text answer in this flow:
// anything we ask the prospect to TYPE has to be read by an agent, not a
// regex. We control the question, never the answer: "70k", "$70,000 a year",
// "about a third", "seventy thousand EGP", "1.5 days a week" are all things
// people write into these boxes, and the same pass is where we'd learn the
// report's currency (EGP vs $) instead of assuming dollars. Every regex in
// this file is the static stand-in until that agent exists — it is why the
// reveal keeps withholding numbers the user actually gave us. Everywhere the
// user types prose, this comment applies; grep TODO(agent) for the sites.
//
// Until then: strips the formatting these fields see in practice (currency
// signs, thousands commas, a percent sign, a k/m suffix) and reads the rest
// as a plain number. Words are read as missing, same as an empty field.
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

// Reads one of OUR OWN canned estimate strings — the "about 4 people" /
// "about $72k a year" / "about a third" copy in DEMOS — back into a number.
// Deliberately not the same job as parseNumeric: this input is copy we wrote
// and can grep, so a small reader over the shapes we actually use is enough
// and no agent is needed here. The moment an estimate comes from research
// rather than from DEMOS, it should arrive as a number and this goes away.
const WORD_FRACTIONS: Record<string, number> = {
  'a quarter': 0.25,
  'a third': 1 / 3,
  half: 0.5,
}

export function parseEstimateText(raw: string | undefined): number | null {
  if (raw == null) return null
  const text = raw.toLowerCase()
  for (const phrase of Object.keys(WORD_FRACTIONS)) {
    if (text.includes(phrase)) return WORD_FRACTIONS[phrase]
  }
  const token = text.replace(/,/g, '').match(/-?\$?\d*\.?\d+\s*[km%]?/)
  return token ? parseNumeric(token[0]) : null
}

// POC-only fallback (LYR-188): a field the user left blank falls back to the
// estimate the interview already showed them for that question, flagged
// `isEstimated` with source 'estimate' so the reveal can mark it as ours.
// This is what makes the Next-Next-Next demo walk show figures at all.
// It never overrides a number the user gave, and an estimate with nothing
// numeric in it ("Nothing to base one on", the no-scan copy) stays missing.
function orEstimate(field: BridgedField, estimate?: string): BridgedField {
  if (field.value !== null) return field
  const value = parseEstimateText(estimate)
  return value === null
    ? field
    : { value, isEstimated: true, source: 'estimate' }
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
// CONFIRMED (Yousef, review of PR #56): the inversion is correct — Q4 asks
// for the leftover, so automatablePct = 1 − answer. QUANT's own comment in
// pages/v2/index.jsx was updated to say so; don't "fix" this back.
export function bridgeAutomatable(
  answer: SegmentedAnswer | undefined,
  estimate?: string,
): BridgedField {
  const field = orEstimate(bridgeAnswer(answer), estimate)
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
//
// `estimates` is positionally the same five-slot array, holding the estimate
// copy the interview showed for each question (quantFor(demo, i).estimate).
// Passing it in keeps this file free of DEMOS: the caller decides which
// estimates the user was actually shown, this file only reads them.
export function bridgePainQuant(
  quant: SegmentedAnswer[] = [],
  estimates: (string | undefined)[] = [],
): BridgedPainFields {
  return {
    people: orEstimate(bridgeAnswer(quant[1]), estimates[1]),
    hoursPerWeek: orEstimate(bridgeAnswer(quant[2]), estimates[2]),
    annualPay: orEstimate(bridgeAnswer(quant[3]), estimates[3]),
    automatablePct: bridgeAutomatable(quant[4], estimates[4]),
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
