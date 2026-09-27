// ─────────────────────────────────────────────────────────────────────────────
// reportModel.typecheck — a test that runs in the type checker, not the test
// runner (LYR-203)
//
// The rules in reportModel.ts are about types: "only format.ts makes a
// figure", "hours spent can't go where hours returned belongs". You can't check
// that from `node --test`, because the thing being tested IS the type system.
// So it is checked here.
//
// Every `@ts-expect-error` below claims the next line is an error. If that line
// ever stops being an error, the compiler fails with "unused '@ts-expect-error'
// directive". That is what makes this a guard and not a comment: weaken one of
// the types in reportModel.ts and `next build` breaks.
//
// Same pattern as src/lib/roi/research/types.typecheck.ts. Nothing here runs.
// Everything is exported to keep the unused-variable rule quiet.
// ─────────────────────────────────────────────────────────────────────────────

import { hoursReturned, hoursSpent } from './format'
import type { ReportModel } from './reportModel'
import { SAMPLE_REPORT } from './sampleReport'

type Row = ReportModel['workflowRows'][number]
const row: Row = SAMPLE_REPORT.workflowRows[0]

/* 1. A number can't go where text belongs. Every figure is formatted once, in
      format.ts, so no screen ever has to. */
// @ts-expect-error — a number is not text
export const rawNumber: Row = { ...row, gain: 106115 }

/* 2. Nor can plain text. This is the one that stops another file formatting a
      number itself and slipping it in: "$106,115" typed by hand is not a
      Figure. */
// @ts-expect-error — a plain string is not a Figure
export const handTyped: Row = { ...row, gain: '$106,115' }

/* 3. Hours spent can't go where hours returned belongs. Printing the hours a
      team spends today as "hours back" would overstate the saving. */
// @ts-expect-error — a HoursSpent is not a HoursReturned
export const swapped: Row = { ...row, hours: hoursSpent(3000) }

/* 4. A process-map step is done by the agent, drafted by the agent, or
      unchanged. Nothing else. */
export const badStep: ReportModel['processMap'][number] = {
  n: '01',
  step: 'Match each payment to its invoice',
  detail: 'where most of the hours go',
  today: 'finance team',
  // @ts-expect-error — 'maybe' is not one of the three
  after: 'maybe',
}

/* 5. A snapshot row can only point at a page the research agent really
      opened. A URL typed in by hand, which is how a made-up citation would get
      in, is refused. */
export const madeUpSource: ReportModel['snapshot'][number] = {
  label: 'size',
  value: '38 people',
  tag: 'Your site',
  // @ts-expect-error — a plain string is not a Link
  source: 'https://acmelegal.com/team',
}

/* The right way through each: the functions in format.ts. */
export const fine: Row = { ...row, hours: hoursReturned(1092) }

/* What this does NOT catch, stated plainly. This repo compiles with strict
   checks off, so `null` fits in any field:

     const blank: Row = { ...row, gain: null }   // compiles. It should not.

   So the types stop a hand-formatted number and a swapped hours figure, which
   are the failures that matter. They don't stop a missing one. That is the
   Assembler's job (LYR-243): a missing answer becomes a question to confirm,
   never a blank figure. */
