// ─────────────────────────────────────────────────────────────────────────────
// types — the shapes the research agent works with.
//
// This whole part of the app exists because the old research agent made things
// up. Its prompt demanded exactly four workflows and a monthly volume whether or
// not any evidence existed. "We found nothing" was not an allowed answer, so it
// invented one.
//
// Two things in this file stop that happening again. Not by asking nicely in a
// prompt — by making it impossible.
//
//   1. A finding cannot exist without a link. The link is not an ordinary
//      string. It is a type only `link()` can make, and `link()` checks the URL.
//      You cannot write a finding by hand with a made-up URL in it. It will not
//      compile.
//
//   2. "Found nothing" and "could not look" are different answers and must never
//      be mixed up. A firm that is not hiring is a fact we can say out loud. A
//      firm whose site we never reached is a hole in what we know, and the
//      report has to stay quiet about it.
//
// Why a special type and not a plain string: this repo compiles with
// TypeScript's strict checks off, so a plain string field would still accept
// null. The special type is what actually holds the line here.
// ─────────────────────────────────────────────────────────────────────────────

/* A URL that has been through `link()`. The private marker is what makes a
   plain string unusable: there is no way to make this type except by calling
   that function. */
declare const CHECKED: unique symbol
export type Link = string & { readonly [CHECKED]: true }

/* Makes a checked link, or nothing if the input is not a real http address.

   It returns nothing rather than throwing. This runs while a report is being
   made, and nothing on that path is allowed to throw. A caller that cannot make
   a link is expected to drop the finding — which is the right answer. A thing we
   cannot point at is a thing we should not say. */
export function link(raw: string): Link | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  return parsed.toString() as Link
}

/* One thing we can tell the company about itself, in a sentence, with a link
   they can open. This is what the side panel shows — not a list of URLs. */
export type Finding = {
  /* A short sentence a person would actually say. "You're hiring a paralegal
     whose first listed duty is chasing outstanding client documents" — never
     "job_posting: paralegal". */
  says: string
  /* What it is about: hiring, systems, location, size, services, turnover.
     Used to group rows in the panel and to spot repeats. */
  about: string
  /* A page we really opened during this run. Anything else is thrown away
     before a person sees it. */
  link: Link
  /* Their exact words, when the page had some worth quoting. This is what lets
     the report quote instead of reword. */
  quote?: string
  /* When we downloaded the page, not when we asked for it. A page served from
     the cache reports when it was first downloaded. */
  when?: string
}

/* What happened when we tried something. One row per call.
   `why` is the point of this whole type. See the note in `tools.ts`. */
export type Attempt = {
  /* What we tried, in words a person can read: "read hlbhamt.com/career/". */
  tried: string
  got: 'page' | 'nothing' | 'refused' | 'timeout'
  ms: number
  /* Why, when it did not work. A sentence, not a code — it ends up in front of
     a prospect by way of `gaps`. */
  why?: string
}

/* Everything the agent worked out about one company. This is the whole output.
   There is no separate scout result and no second pass over it. */
export type Research = {
  findings: Finding[]
  /* What this company seems to do by hand that a system could take over, in the
     agent's own words, each one grounded in something it actually read. */
  handWork: string[]
  /* What we could not find out, and why. Saying it out loud is what makes a
     thin answer read as "we could not look here" instead of "this company does
     nothing". */
  gaps: string[]
  /* How boldly the report may speak.
       lots   — enough dated, specific evidence to say something only this
                company would recognise, and to quote it
       some   — real but thin. Hedge, and lean on what the user told us
       little — say nothing about the company at all */
  confidence: 'lots' | 'some' | 'little'
  /* Every call we made and what came back. Always filled in, even on a run that
     found nothing — especially then. */
  tried: Attempt[]
}

export const EMPTY_RESEARCH: Research = {
  findings: [],
  handWork: [],
  gaps: [],
  confidence: 'little',
  tried: [],
}

/* How long a quote may be. The first 200 characters of a page are still the
   page's own words, which is the part that matters. */
export const QUOTE_MAX = 200
