// ─────────────────────────────────────────────────────────────────────────────
// reportModel — the shape of the V2 report (LYR-203)
//
// Two shapes live here, and everything else in the report is built around them.
//
//   ReportModel  everything the report page shows. The screen, the shared link,
//                the PDF and the report agent all read this one object, so they
//                can never show two different reports.
//   ReportWords  how the report agent's writing is stored. It holds no numbers.
//
// The report is made by separate parts, each owning one job (the table "One
// owner per job" on LYR-202). The Calculator does the maths, the Formatter
// (format.ts) turns numbers into text, and the Assembler (buildReport.ts) puts
// everything into a ReportModel. This file is where those parts meet.
//
// Why every number here is text: the Formatter formats a number once, and every
// screen prints what it made. No screen formats a number itself, so $168,000 can
// never also appear as 168000, and the PDF can never disagree with the web page.
// Even bar widths arrive as text, like "36%".
//
// Nothing here runs. It is types only, and imports nothing from V1.
// ─────────────────────────────────────────────────────────────────────────────

import type { Link } from '../research/types'

/* Three kinds of text that only format.ts may make. At runtime each is a plain
   string. In code, the private marker on each means the compiler refuses a
   plain string or a number in its place, so no other file can format a number
   and slip it into the report. The same trick as `Link` in
   src/lib/roi/research/types.ts, the type that makes a made-up URL fail to
   compile. Checked in reportModel.typecheck.ts.

   Figure         any number already turned into text: "$46,137", "65%"
   HoursSpent     hours spent today = people × hours a week × weeks
   HoursReturned  hours handed back = hours spent × how much can be automated
                  × take-up × how much of the saving lands

   The last two are kept apart because they are easy to confuse and they are
   very different claims. Hours spent is solid: the user told us. Hours returned
   is worked out, and always smaller. Printing hours spent as "hours back" would
   overstate the saving to a finance director. */
declare const Figure_CHECKED: unique symbol
declare const Spent_CHECKED: unique symbol
declare const Returned_CHECKED: unique symbol
export type Figure = string & { readonly [Figure_CHECKED]: true }

export type HoursSpent = string & { readonly [Spent_CHECKED]: true }

export type HoursReturned = string & { readonly [Returned_CHECKED]: true }

export type ProvenanceKind = 'given' | 'estimated' | 'benchmarked'

/* Who does a process-map step once the agent is in place. */
export type After = 'agent' | 'agent-drafts' | 'unchanged'

export type ReportModel = {
  // 1 · Recommended starting point
  thesis: string

  // 2 · Company snapshot, copied from research findings. No AI rewrites them.
  // ★ Not in v11: `source` is a Link, so a row can only point at a page the
  // research agent really opened.
  snapshot: { label: string; value: string; tag: string; source: Link }[]

  // 3 · Proposed AI workflows, biggest gain first
  workflowsSub: string
  workflowRows: {
    // ★ Not in v11: the pain's position in the interview, counting from 0.
    // Rows re-sort when an answer changes; the id stays the same, so the screen
    // and the agent can keep track of which row is which.
    id: string
    workflow: string
    agent: string
    // ★ HoursSpent, not plain text: hours spent today. Solid.
    total: HoursSpent
    // ★ HoursReturned, not plain text: hours handed back. Worked out, smaller.
    hours: HoursReturned
    // total − hours: what stays with a person
    remaining: Figure
    // bar width for "stays with a person", e.g. "64%"
    remainPct: Figure
    gain: Figure
    od: Figure // wages you get back (the operational dividend)
    uplift: Figure // what the freed time earns
    today: string
    scope: string
    // the hours-spent line: "4 people × 15 hrs × 50 weeks = 3,000 hrs"
    formula: Figure
    // the calculator's six lines, joined with \n
    chain: Figure
    // `given` is true when the user typed this value; v11 colours it differently
    assumptions: { name: string; value: Figure; why: string; given: boolean }[]
    // ★ Not in v11: the least certain input to this row. Drawn by
    // ProvenanceMark (src/components/ui/roi/ProvenanceMark.jsx). Rule P3 on
    // LYR-162: where a number came from travels with it.
    mark: ProvenanceKind
  }[]
  totalsLabel: string
  totalHours: HoursReturned // the sum of the hours-returned column
  totalGain: Figure
  rejected: { workflow: string; reason: string }[]

  // 4 · Process map, top workflow only, six steps
  mapTitle: string
  processMap: {
    n: string
    step: string
    detail: string
    today: string
    after: After
  }[]

  // 5 · Profit uplift
  levers: { label: string; from: string; value: Figure }[]
  totalOd: Figure
  totalUplift: Figure
  odPct: Figure // the split bar: wages back
  upliftPct: Figure // the split bar: uplift. Always adds up to 100% with odPct

  // 6 · Three-year outlook, cumulative
  outlook: {
    total: Figure
    label: string
    heightPct: Figure // column height against year three
    odPct: Figure
    upliftPct: Figure
  }[]

  // 7 · Cost of delay
  delayMonthly: Figure
  delayCopy: string

  // 8 · Roadmap: four fixed phases; the agent writes only `detail`
  roadmap: { weeks: string; phase: string; detail: string }[]

  // 9 · Next steps
  nextCopy: string
  journey: { n: string; label: string }[]
  guaranteeCopy: string
  confirmSub: string
  confirm: { item: string; note: string }[]

  // ★ Not in v11's data: v11 types its headings and subtitles into the page.
  // Here they come from fixedWords.ts (LYR-209), which says no screen
  // component may contain fixed text, so they travel in the object.
  sections: { ref: string; title: string; sub: string }[]
  nav: { label: string; ref: string }[]
  legend: string // ★ same reason as `sections`
  disclaimer: string
}

/* How the report agent's writing is stored. The agent never sees this shape:
   it reads and edits ReportModel, and its edits to word fields land here. No
   numbers live here, which is how "the AI never types a number" holds.

   `pain` is a piece of work's position in the interview's list of pains,
   counting from 0. It is the same number as a workflow row's `id`. */
export type ReportWords = {
  // the "What we noticed" sentence on the reveal screen (LYR-200)
  noticed: string
  thesis: string
  workflowsSub: string
  workflows: {
    pain: number
    workflow: string
    agent: string
    today: string
    scope: string
  }[]
  rejected: { pain: number; reason: string }[]
  mapTitle: string
  processMap: { step: string; detail: string; today: string; after: After }[]
  levers: { pain: number; label: string }[]
  delayCopy: string
  // the detail line under each of the four fixed roadmap phases, in order
  roadmap: string[]
  nextCopy: string
  // `key` is "<pain>:<question>", matching a confirm row the code made, e.g.
  // "1:annualPay". The question names are the ones answerBridge.ts uses.
  confirmNotes: { key: string; note: string }[]
}
