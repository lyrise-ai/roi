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
// files and calls nothing, so it runs the same in the browser and in Node.
// format.ts turns its numbers into text.
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
import { about, spelled } from './format'

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s
}

function isUsable(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
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
  const rawPeopleStr =
    peopleCount === null
      ? null
      : peopleCount === 1
        ? 'one person'
        : `${spelled(peopleCount)} people`

  const peopleText =
    rawPeopleStr === null
      ? null
      : people?.isRange
        ? `Around ${rawPeopleStr}`
        : capitalize(rawPeopleStr)

  const rawHoursStr =
    hoursValue === null ? null : `${spelled(hoursValue)} hours`
  const hoursText =
    rawHoursStr === null
      ? null
      : hoursPerWeek?.isRange
        ? `about ${rawHoursStr}`
        : rawHoursStr

  const annualText = isUsable(annualHours)
    ? `${about(annualHours)} hours`
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
