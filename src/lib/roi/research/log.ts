// ─────────────────────────────────────────────────────────────────────────────
// log — what the research agent did, written where a person can read it.
//
// An agent that picks its own next move is a black box. When it comes back with
// nothing, the only question anyone asks is "what did it actually try?" — and
// without this file the honest answer is that nobody knows.
//
// Two places, on purpose:
//
//   console  — one run, in order, readable. This is for the person looking at a
//              Vercel log because one company came back empty.
//   PostHog  — three events, added up across every run. This is for the
//              question no single log line can answer: how often does this
//              happen, and what beats us most?
//
// PostHog replaces something we deleted. The old coverage harness measured
// retrieval against 25 domains we chose. `research_call_failed`, added up,
// measures it against every real prospect — a bigger and more honest sample that
// costs nothing to collect.
//
// ── Levels matter more here than in most code ────────────────────────────────
//
// In this system a failed fetch is NORMAL. A 404 on a careers page is the
// expected case, not a fault. So:
//
//   console.log    what happened
//   console.warn   a call failed for an ordinary reason — timeout, 404, refused
//   console.error  a real fault: the loop threw, the model call broke
//
// This is not fussiness. CLAUDE.md says never to switch Sentry's console capture
// back on, because it turns every `console.error` into an issue and therefore a
// Linear ticket. Log ordinary misses at error level and this file becomes the
// biggest ticket generator in the repo the day somebody flips that switch.
//
// It is the same line the whole system rests on: "we found nothing" is not
// "we could not look".
// ─────────────────────────────────────────────────────────────────────────────

import { EVENTS } from '@/src/lib/analytics'
import { captureServer } from '@/src/lib/posthog-server'
import type { Attempt, Research } from './types'

export type Log = {
  /* The run began. */
  start: () => void
  /* One model turn finished, and these are the tools it reached for. */
  step: (number: number, using: string[]) => void
  /* One tool call finished. `why` is filled in only when it did not work. */
  call: (attempt: Attempt) => void
  /* A finding was accepted and sent to the panel. */
  noted: (says: string) => void
  /* A finding was refused because it pointed at a page we never opened. */
  refused: (url: string) => void
  /* The run finished normally. */
  done: (found: Research, ms: number, steps: number) => void
  /* The run broke. This is the only thing here that is an error. */
  broke: (error: unknown, ms: number, ms_findings: number) => void
}

/* Logged before a run exists, so it cannot go through the logger below.

   Deliberately NOT sent to PostHog. A typo in the Website box is the prospect's
   mistake, not ours, and counting it as a failed research run would poison the
   number that tells us how often WE come back empty. */
export function badDomain(input: string): void {
  console.warn(`[research] "${input}" is not a web address we can look up`)
}

/* Every line carries the domain. Several reports run at once on a warm server,
   and without this their lines interleave into something unreadable. */
export function startLog(domain: string): Log {
  const tag = `[research ${domain}]`

  return {
    start() {
      console.log(`${tag} start`)
    },

    step(number, using) {
      if (using.length > 0) {
        console.log(`${tag} step ${number}: ${using.join(', ')}`)
      }
    },

    call(attempt) {
      const ms = `${attempt.ms}ms`
      if (attempt.got === 'page') {
        console.log(`${tag}   ok ${ms.padStart(7)}  ${attempt.tried}`)
        return
      }
      /* warn, not error. Most of these are a page that simply is not there,
         which is the ordinary result of looking. */
      console.warn(
        `${tag}   ${attempt.got.toUpperCase().padEnd(7)} ${ms.padStart(7)}  ${attempt.tried}`,
      )
      if (attempt.why) console.warn(`${tag}       ${attempt.why}`)

      captureServer(EVENTS.RESEARCH_CALL_FAILED, {
        domain,
        got: attempt.got,
        /* The first few words of the attempt, so the event says which KIND of
           call failed without carrying a whole URL into analytics. */
        doing: attempt.tried.split(' ')[0],
        ms: attempt.ms,
      })
    },

    noted(says) {
      console.log(`${tag}   noted: ${says.slice(0, 90)}`)
    },

    refused(url) {
      /* Not an error — the agent is told why and usually goes and reads the
         page. It is only alarming in bulk, which is what the event is for. */
      console.warn(
        `${tag}   REFUSED a finding pointing at ${url} (never opened)`,
      )
      captureServer(EVENTS.RESEARCH_FINDING_REFUSED, { domain })
    },

    done(found, ms, steps) {
      const failed = found.tried.filter((a) => a.got !== 'page').length
      console.log(
        `${tag} done in ${(ms / 1000).toFixed(1)}s — ${found.findings.length} findings, ` +
          `confidence ${found.confidence}, ${found.tried.length} calls (${failed} failed), ` +
          `${found.gaps.length} gaps`,
      )
      /* Printed in full, because this is the half that used to be invisible.
         A run that found nothing has to say why, or the next person to look at
         this log learns nothing from it. */
      for (const gap of found.gaps) console.log(`${tag}   gap: ${gap}`)

      captureServer(EVENTS.RESEARCH_COMPLETED, {
        domain,
        findings: found.findings.length,
        confidence: found.confidence,
        calls: found.tried.length,
        failed_calls: failed,
        gaps: found.gaps.length,
        steps,
        duration_ms: ms,
      })
    },

    broke(error, ms, findingsKept) {
      /* A real fault, and the only thing in this file logged as one. */
      console.error(
        `${tag} BROKE after ${(ms / 1000).toFixed(1)}s: ${error instanceof Error ? error.message : String(error)}`,
      )
      captureServer(EVENTS.RESEARCH_COMPLETED, {
        domain,
        findings: findingsKept,
        confidence: 'little',
        broke: true,
        error: error instanceof Error ? error.message : String(error),
        duration_ms: ms,
      })
    },
  }
}
