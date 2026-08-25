// ─────────────────────────────────────────────────────────────────────────────
// types.typecheck — a test that runs in the type checker, not the test runner.
//
// The rule is "a finding cannot be built without a link we really opened —
// check by trying, it should be a type error". You cannot check that from
// `node --test`, because the thing being tested IS the type system. So it is
// checked here.
//
// Every `@ts-expect-error` below claims the next line is an error. If that line
// ever stops being an error, the compiler fails with "unused '@ts-expect-error'
// directive". That is what makes this a real guard and not a comment: weaken the
// `Link` type, or make the field optional, and `next build` breaks.
//
// Nothing here runs. It exists only to be compiled. Everything is exported to
// keep the unused-variable rule quiet.
// ─────────────────────────────────────────────────────────────────────────────

import { type Finding, type Link, link } from './types'

/* 1. You cannot leave the link out. This is the shape the old research agent
      produced: everything worked out, nothing pointed at. */
/* The marker sits above the whole declaration, not inside the object. A missing
   required field is reported against the object as a whole. */
// @ts-expect-error — link is required
export const noLink: Finding = {
  says: 'They are hiring a paralegal',
  about: 'hiring',
}

/* 2. You cannot write a URL in by hand. This is the one that matters: it is how
      a model's made-up citation would get in, if it could. */
export const madeUp: Finding = {
  says: 'They are hiring a paralegal',
  about: 'hiring',
  // @ts-expect-error — a plain string is not a Link
  link: 'https://acmelaw.com/careers',
}

/* 3. Nor can you cast your way past it with something that is not a URL at
      all. */
// @ts-expect-error — 'not a url' is not a Link
export const notEvenAUrl: Link = 'not a url'

/* 4. The only way through is `link()`, which checks. It gives back null for
      anything that is not a real http address, so the caller has to deal with
      the null — which is the point. Dropping the finding is the right answer:
      something we cannot point at is something we should not say. */
export const checked: Link | null = link('https://acmelaw.com/careers')

/* 5. What this does NOT catch, stated plainly so nobody assumes otherwise.
      This repo compiles with strict checks off, so `null` is assignable to
      anything and the compiler will not make you handle the null `link()` can
      return:

        const skipped: Link = link(whatever)   // compiles. It should not.

      So the type stops a made-up URL, which is the failure that matters. It
      does not stop a forgotten null check. That is why the run-time check —
      throwing away any finding whose link is not in the set of pages we really
      opened — has to exist as well, and cannot be argued away as belt and
      braces. */
