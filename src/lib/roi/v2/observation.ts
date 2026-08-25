// ─────────────────────────────────────────────────────────────────────────────
// observation — Profit Map POC (LYR-188 / POC 10, piece 3)
//
// The "I heard you" moment: one plain sentence above the two big figures that
// says the user's own numbers back to them — "Four people spending twelve
// hours a week each adds up to about 7,600 hours a year." It replaced the raw
// pain-point text the reveal screen used to show.
//
// The sentence is built by joining words together, and nothing else. No model
// call, no research call, no API. This file sits right next to the maths (it
// takes numbers someone else worked out and puts them into words), so it stays
// a plain template, like miniCalculator.ts and answerBridge.ts. It reads no
// files, calls nothing, and imports only a type from answerBridge.ts — so it
// runs the same in the browser and in Node.
//
// people and hoursPerWeek arrive in answerBridge's shape ({value, isEstimated,
// source}) because that is what the questions page hands over. Their .value is
// empty when the question was left blank, and this file must never turn that
// into an invented number. annualHours is a plain number or null instead,
// because it comes out of the calculator, not out of an answer.
//
// If a pain point is missing one of the three, we fall back to a sentence
// about what we DO know. In practice annualHours never exists without both
// people and hours a week (see figuresFor in pages/v2/index.jsx), but this
// function does not rely on that. It builds from whichever of the three it
// has, so it stays correct on its own and can be tested on its own.
// ─────────────────────────────────────────────────────────────────────────────

import type { BridgedField } from './answerBridge'

// Newspaper style: write out small numbers as words, and switch to digits
// above twenty so the sentence never reads "one hundred forty-seven people".
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

// annualHours is already a whole number, but something like 2,437 in a
// sentence pretends to be more exact than it is. So we round it to a step that
// suits its size: it reads "about 7,600", not "about 7,437".
function friendlyAnnualHours(n: number): string {
  const abs = Math.abs(n)
  const step = abs >= 10_000 ? 500 : abs >= 1_000 ? 100 : abs >= 100 ? 10 : 1
  return (Math.round(n / step) * step).toLocaleString('en-US')
}

// Builds the sentence shown on the reveal screen for the chosen pain point.
// - people, hoursPerWeek: that pain point's answers, as answerBridge returns
//   them. Their .value can be empty (blank answer, or "let AI estimate" with
//   nothing to fall back on).
// - annualHours: calc.annualHours from figuresFor(), or null when we could not
//   work it out because people or hours a week was missing.
// It always returns a real sentence — never "null", "NaN" or a bare dash — so
// the reveal screen can print it without checking anything first.
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
