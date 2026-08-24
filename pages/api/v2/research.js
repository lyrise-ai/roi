/* The scan panel's server side (LYR-199 R6).

   `/v2` had none until this route: the panel was a `setInterval` walking a
   canned array. This is the channel to the real research system, and it is a
   stream rather than a request/response because the research takes 5-20s and
   the panel must fill while the prospect answers their next question. S1 lands
   in ~1s; waiting for S2 to finish before painting anything would turn a
   progressive panel into a spinner.

   Two agents, one hook: `runResearch` calls `analyst.onScoutResolved` the
   moment a scout lands, the analyst re-reads everything landed so far, and
   each verified finding is written to the wire as it streams out of the model.
   The only LLM call on this path is the analyst's, and it is upstream — this
   route makes none of its own and does no selection, ranking or re-wording of
   what it forwards. The sentences are already written and already grounded.

   Deliberately GET: the client is an `EventSource`, which is the browser's own
   SSE reader and only speaks GET. The alternative is hand-rolling a fetch
   stream parser for a request with one parameter in it.

   SSE mechanics — headers, `send`, client disconnect as the stop signal —
   mirror `pages/api/roi-agent.js`, which has been carrying real generations
   for months. Nothing here invents a cancellation protocol. */
import { normalizeDomain } from '@/src/lib/roi/research/scouts/s1Derive'
import { runResearch } from '@/src/lib/roi/research/orchestrator'
import { createResearchAnalyst } from '@/src/lib/roi/research/researchAnalyst'

export const config = {
  maxDuration: 300,
}

function send(res, event) {
  // Once the connection is closed, writing throws (EPIPE) — silently drop.
  if (res.writableEnded || res.destroyed) return
  res.write(`data: ${JSON.stringify(event)}\n\n`)
  if (typeof res.flush === 'function') res.flush()
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  /* Whatever the prospect typed in the Website field, down to a hostname. This
     is a trust boundary and `normalizeDomain` is the validator the scouts
     already run their own input through — a typo is rejected here rather than
     becoming a fetch of a nonsense URL. */
  const domain = normalizeDomain(String(req.query.domain ?? ''))
  if (!domain) {
    res.status(400).json({ error: 'invalid_domain' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  /* Client disconnect is the stop signal. A prospect who closes the tab or
     goes back to the company screen should not leave scouts crawling and an
     analyst billing against a panel nobody is looking at. The orchestrator has
     its own 30s ceiling, so this bounds the spend rather than the process. */
  let gone = false
  res.on('close', () => {
    if (!res.writableEnded) gone = true
  })

  try {
    const analyst = createResearchAnalyst(domain, {
      onFinding: (finding) => {
        if (gone) return
        send(res, { type: 'finding', finding })
      },
    })
    await runResearch(domain, { onScoutResolved: analyst.onScoutResolved })
    await analyst.settled()
  } catch (error) {
    /* Nothing on this path is allowed to throw at the client. The panel's
       correct response to a failed run is the empty state — no panel — which
       is what `done` with nothing sent produces. */
    console.error(`[v2/research] ${domain}: ${error?.message ?? error}`)
  }

  /* Always sent, including after a failure and after a run that found nothing.
     It is what stops the panel saying "looking…" forever, and what tells the
     client to close the EventSource rather than let it reconnect and start a
     second research run. */
  send(res, { type: 'done' })
  res.end()
}
