// ─────────────────────────────────────────────────────────────────────────────
// answerBridge — Profit Map POC (LYR-188 / POC 10)
//
// The questions page (pages/v2/index.jsx) keeps each pain point's five number
// answers exactly as the input control produced them: {mode:'exact', exact},
// {mode:'range', low, high} or {mode:'estimate'}. None of those are numbers.
// miniCalculator.ts needs plain numbers. This file sits between the two and
// does that conversion.
//
// The rule it never breaks: it does not make up a number for a question the
// user did not answer. It reports the answer as missing instead. That way the
// reveal screen can decide what to do — hold the figure back, or show it with
// a mark next to it — rather than quietly receiving a 0 and printing a wrong
// number.
//
// The five answers come in a fixed order, matching QUANT in
// pages/v2/index.jsx exactly:
//   quant[0] = how many times a month  — not used here, the calculator has no
//                                        field for it
//   quant[1] = how many people
//   quant[2] = hours a week, each
//   quant[3] = pay per year
//   quant[4] = "how much would still need a person" after automation
//
// Nothing in this file reads a file, calls a server, or imports anything. It
// runs the same in the browser and in Node, which is what makes it easy to
// test.
// ─────────────────────────────────────────────────────────────────────────────

export type SegmentedAnswer =
  | { mode: 'exact'; exact?: string }
  | {
      mode: 'range'
      low?: string | number
      high?: string | number
      band?: string
    }
  | { mode: 'estimate' }

export interface BridgedField {
  value: number | null
  isEstimated: boolean
  // Where the number came from. 'user' means they typed it or chose a range band.
  // 'estimate' means they left it blank and we used the fixed estimate.
  source: 'user' | 'estimate' | null
  isRange?: boolean
}

const MISSING: BridgedField = { value: null, isEstimated: false, source: null }

const PRESET_BAND_MIDPOINTS: Record<string, { low: number; high: number }> = {
  // Volume
  'under 20': { low: 0, high: 20 },
  '20–100': { low: 20, high: 100 },
  '100–500': { low: 100, high: 500 },
  '500 or more': { low: 500, high: 1000 },
  // People
  '1–3': { low: 1, high: 3 },
  '4–10': { low: 4, high: 10 },
  '10–25': { low: 10, high: 25 },
  '25 or more': { low: 25, high: 50 },
  // Hours
  'under 5': { low: 0, high: 5 },
  '5–15': { low: 5, high: 15 },
  '15–30': { low: 15, high: 30 },
  '30 or more': { low: 30, high: 40 },
  // Pay
  'under $30k': { low: 0, high: 30000 },
  '$30k–$60k': { low: 30000, high: 60000 },
  '$60k–$100k': { low: 60000, high: 100000 },
  '$100k or more': { low: 100000, high: 150000 },
  // Automatable
  'under 25%': { low: 0, high: 0.25 },
  '25%–50%': { low: 0.25, high: 0.5 },
  '50%–75%': { low: 0.5, high: 0.75 },
  '75% or more': { low: 0.75, high: 1.0 },
}

export function parseBandText(
  raw: string | undefined,
): { low: number; high: number } | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase()
  if (PRESET_BAND_MIDPOINTS[trimmed]) return PRESET_BAND_MIDPOINTS[trimmed]

  if (trimmed.startsWith('under ') || trimmed.startsWith('less than ')) {
    const num = parseNumeric(trimmed.replace(/^(under|less than)\s+/i, ''))
    if (num !== null) return { low: 0, high: num }
  }
  if (trimmed.endsWith(' or more') || trimmed.endsWith('+')) {
    const num = parseNumeric(trimmed.replace(/(\s*or more|\+)$/i, ''))
    if (num !== null) return { low: num, high: num * 2 }
  }
  const parts = trimmed.split(/–|-|to/)
  if (parts.length === 2) {
    const low = parseNumeric(parts[0])
    const high = parseNumeric(parts[1])
    if (low !== null && high !== null) return { low, high }
  }
  return null
}

// TODO(agent) — the rule for every typed answer in this flow: if we ask the
// user to type it, an agent has to read it, not a pattern match.
//
// We choose the question. We never choose the answer. People write "70k",
// "$70,000 a year", "about a third", "seventy thousand EGP", "1.5 days a week"
// into these boxes, and all of those are reasonable things to write. The same
// reading pass is also where we would learn which currency the report should
// be in, instead of assuming dollars.
//
// Every pattern match in this file is a stand-in until that agent exists. It
// is also the reason the reveal screen sometimes holds back a number the user
// did give us: we simply could not read it. This applies anywhere the user
// types free text — search for TODO(agent) to find the places.
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
  return n // A '%' sign changes nothing: the calculator already reads anything above 1 as a percentage
}

// Turns one of OUR OWN estimate strings back into a number — the "about 4
// people", "about $72k a year", "about a third" wording in DEMOS.
//
// This is a different job from parseNumeric above, and it does not need an
// agent. That one reads what a stranger typed; this one reads text we wrote
// ourselves and can search for. So a small reader covering the few shapes we
// actually use is enough. Once estimates come from real research instead of
// DEMOS, they should arrive as numbers and this can go.
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

// POC-only stand-in (LYR-188). If the user left a question blank, we use the
// estimate the questions page already showed them for it, flagged as an
// estimate so the reveal screen can mark it as ours. This is what makes the
// click-through demo show any figures at all.
//
// It never replaces a number the user gave. And an estimate with no number in
// it ("Nothing to base one on", what we say when we know nothing about the
// company) stays missing.
function orEstimate(field: BridgedField, estimate?: string): BridgedField {
  if (field.value !== null) return field
  const value = parseEstimateText(estimate)
  return value === null
    ? field
    : { value, isEstimated: true, source: 'estimate' }
}

// Turns one answer from the input control into a number the calculator can
// use, with a note saying where it came from.
// - 'exact': the number they typed, or missing if the box was empty or we
//   could not read it.
// - 'range': the midpoint of the selected preset band or low/high bounds.
// - 'estimate': they gave no number. We flag it as an estimate and leave the
//   value empty rather than inventing one — see the `source` note above.
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
      let low = parseNumeric(
        typeof answer.low === 'number' ? String(answer.low) : answer.low,
      )
      let high = parseNumeric(
        typeof answer.high === 'number' ? String(answer.high) : answer.high,
      )

      if (low === null && high === null && answer.band) {
        const bandBounds = parseBandText(answer.band)
        if (bandBounds) {
          low = bandBounds.low
          high = bandBounds.high
        }
      }

      if (low === null && high === null) return MISSING
      if (low === null)
        return {
          value: high,
          isEstimated: false,
          source: 'user',
          isRange: true,
        }
      if (high === null)
        return {
          value: low,
          isEstimated: false,
          source: 'user',
          isRange: true,
        }
      return {
        value: (low + high) / 2,
        isEstimated: false,
        source: 'user',
        isRange: true,
      }
    }
    case 'estimate':
      return { value: null, isEstimated: true, source: null }
    default:
      return MISSING
  }
}

// The fifth question asks how much STILL needs a person after automation. The
// calculator wants the opposite: how much automation takes away. So we flip
// it here.
//
// We flip it in whatever unit the user answered in. A fraction stays a
// fraction (1 − x). A number above 1 is read as a percentage, so it flips the
// same way (100 − x). Either way the calculator can use the result directly.
//
// CONFIRMED (Yousef, review of PR #56): flipping is correct. The question asks
// for what is left over, so automatable = 1 − answer. The comment on QUANT in
// pages/v2/index.jsx was corrected to say so. Do not "fix" this back.
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

// The first answer (how many times a month) is left out on purpose — the
// calculator has no field for it.
//
// `estimates` is a five-item list in the same order, holding the estimate text
// the questions page showed for each one (quantFor(demo, i).estimate). We pass
// it in rather than importing DEMOS here, so this file stays free of demo
// data. The caller knows which estimates the user was actually shown; this
// file only reads them.
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

// Packs the four numbers into the shape the calculator wants — but only if all
// four are real numbers.
//
// A missing one must never turn into a 0 on its way into the calculator. A 0
// would quietly make the figures too small and nobody would see why. So we
// report the set as incomplete instead, and let the reveal screen decide what
// to do: show hours only, say it cannot price this one, or ask for the missing
// answer.
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
