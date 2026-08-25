// ─────────────────────────────────────────────────────────────────────────────
// observation — Profit Map POC (LYR-188 / POC 10, piece 3)
//
// The "we heard you" moment: one plain-language sentence, shown above the
// two figures, that reflects the featured pain point's own numbers back at
// the user ("Four people spending twelve hours a week each adds up to about
// 7,600 hours a year.") instead of the raw pain-point text the reveal used
// to show as a stub.
//
// Deterministic string composition ONLY — no LLM call, no research call, no
// API. This file is arithmetic-adjacent (it reads numbers someone else
// already computed and phrases them), so it stays a pure template, same as
// miniCalculator.ts and answerBridge.ts. Pure: no I/O, only a type-only
// import from answerBridge.ts, safe to call from the browser or from Node.
//
// people and hoursPerWeek are BridgedField (see answerBridge.ts) because
// that's the shape the interview hands the reveal — .value is null for
// anything blank or left as an AI-estimate, and this file must never turn
// that null into an invented number. annualHours is a plain number|null
// because it's already a calculateMiniProfitMap() output, not a bridged
// answer.
//
// A pain point missing a field degrades to a sentence about whatever IS
// known (see figuresFor's comment in pages/v2/index.jsx — annualHours never
// exists without both people and hoursPerWeek, but this function doesn't
// assume that; it composes from whichever of the three values is present so
// it stays correct in isolation and unit-testable on its own).
// ─────────────────────────────────────────────────────────────────────────────

import type { BridgedField } from './answerBridge'

// AP-ish style: spell out small counts, fall back to digits above twenty so
// the sentence doesn't read "one hundred forty-seven people".
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

function spellOrDigits(n: number): string {
  if (Number.isInteger(n) && n >= 0 && n < NUMBER_WORDS.length) {
    return NUMBER_WORDS[n]
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

function isUsable(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

// annualHours is already whole (miniCalculator rounds it), but a raw figure
// like 2,437 reads as false precision in a sentence — round it to a chunk
// that matches its own scale so it reads "about 7,600", not "about 7,437".
function friendlyAnnualHours(n: number): string {
  const abs = Math.abs(n)
  const step = abs >= 10_000 ? 500 : abs >= 1_000 ? 100 : abs >= 100 ? 10 : 1
  return (Math.round(n / step) * step).toLocaleString('en-US')
}

// Builds the reveal's observation sentence for the featured pain point.
// - people, hoursPerWeek: the bridged fields for that pain point (may have
//   a null .value — blank answer or an AI-estimate with no fallback yet).
// - annualHours: figuresFor()'s calc.annualHours, or null when it wasn't
//   computed (people or hoursPerWeek missing).
// Always returns a non-empty, grammatical sentence — never "null", "NaN" or
// a bare dash — so the reveal can render it unconditionally.
export function buildObservationSentence(
  people: BridgedField,
  hoursPerWeek: BridgedField,
  annualHours: number | null,
): string {
  const peopleCount = isUsable(people.value)
    ? Math.max(1, Math.round(people.value))
    : null
  const hoursValue = isUsable(hoursPerWeek.value)
    ? Math.round(hoursPerWeek.value * 10) / 10
    : null

  const isPlural = peopleCount !== null && peopleCount !== 1
  const peopleText =
    peopleCount === null
      ? null
      : peopleCount === 1
        ? 'One person'
        : `${capitalize(spellOrDigits(peopleCount))} people`

  const hoursText =
    hoursValue === null ? null : `${spellOrDigits(hoursValue)} hours`

  const annualText = isUsable(annualHours)
    ? `${friendlyAnnualHours(annualHours)} hours`
    : null

  if (peopleText && hoursText) {
    const each = isPlural ? ' each' : ''
    const base = `${peopleText} spending ${hoursText} a week${each}`
    return annualText
      ? `${base} adds up to about ${annualText} a year.`
      : `${base}.`
  }

  if (peopleText) {
    return `${peopleText} ${isPlural ? 'are' : 'is'} spending time on this every week.`
  }

  if (hoursText) {
    return `About ${hoursText} a week goes into this today.`
  }

  if (annualText) {
    return `This adds up to about ${annualText} a year.`
  }

  return "We don't have numbers for this one yet."
}
