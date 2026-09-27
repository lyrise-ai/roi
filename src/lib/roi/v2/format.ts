// ─────────────────────────────────────────────────────────────────────────────
// format — the Formatter (LYR-203, grown by LYR-242)
//
// The one place in V2 where a number becomes the text a person reads. Currency
// signs, commas, percent signs and units live here and nowhere else, so a
// formatting bug has exactly one place to look.
//
// It never changes a value. The Calculator has already rounded every figure to
// what is shown; this file only adds commas and signs. That is why a column of
// figures adds up to the total printed under it.
//
// LYR-203 starts it with the two hour figures. LYR-242 adds money, percentages
// and the formula lines, and moves the formatting that four other V2 files do
// today into here.
// ─────────────────────────────────────────────────────────────────────────────

import type { HoursReturned, HoursSpent } from './reportModel'

/* A missing or broken value prints as 0, never "NaN". A 0 reads as "not
   answered yet"; "NaN" reads as a broken app in front of a prospect. */
const count = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('en-US')

/* No unit on either. v11 prints the unit itself ("TODAY · 3,000 HRS",
   "1,092 hrs/yr"), so a unit here would print twice. */
export const hoursSpent = (n: number) => count(n) as HoursSpent
export const hoursReturned = (n: number) => count(n) as HoursReturned
