/* The server side of the scan panel (LYR-199 R6).

   Until this route existed, /v2 had none: the panel was a timer walking through
   a canned list. This is the connection to the real research system.

   It keeps the connection open and pushes findings down it, rather than
   answering once, because the research takes 5 to 20 seconds and the panel has
   to fill while the prospect answers their next question. S1 lands in about a
   second; waiting for S2 to finish before showing anything would turn a panel
   that fills up into a spinner.

   Two agents, one connection: the research run tells the analyst the moment a
   scout finishes, the analyst re-reads everything found so far, and each checked
   finding is written out as it comes off the model.

   The only model call on this path is the analyst's, and it happens upstream.
   This route makes none of its own, and does no picking, sorting or rewording of
   what it passes on. The sentences are already written and already sourced.

   It is a GET on purpose: the browser's own reader for this kind of stream only
   speaks GET. The alternative is writing our own stream parser for a request
   with one parameter in it.

   The mechanics — the headers, how we send, and treating the client hanging up
   as the stop signal — copy pages/api/roi-agent.js, which has been carrying
   real generations for months. Nothing here invents its own way of
   cancelling. */
import { normalizeDomain } from '@/src/lib/roi/research/scouts/s1Derive'
import { runResearch } from '@/src/lib/roi/research/orchestrator'
import { createResearchAnalyst } from '@/src/lib/roi/research/researchAnalyst'

export const config = {
  maxDuration: 300,
}

function send(res, event) {
  // Once the connection is closed, writing to it throws. Just drop it.
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

  /* Cuts whatever the prospect typed in the Website field down to a plain
     domain. This is where outside input enters, and `normalizeDomain` is the
     same check the scouts already run their own input through. A typo is
     rejected here rather than turning into a request for a nonsense
     address. */
  const domain = normalizeDomain(String(req.query.domain ?? ''))
  if (!domain) {
    res.status(400).json({ error: 'invalid_domain' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  /* The client hanging up is how we know to stop. A prospect who closes the tab
     or goes back to the company screen should not leave scouts crawling and an
     analyst running up a bill for a panel nobody is looking at. The research run
     has its own 30-second limit, so this caps the spend rather than the run
     itself. */
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
    /* Nothing on this path may throw at the client. The right response to a
       failed run is no panel at all, and that is exactly what saying "done"
       with nothing sent produces. */
    console.error(`[v2/research] ${domain}: ${error?.message ?? error}`)
  }

  /* Always sent, including after a failure and after a run that found nothing.
     It is what stops the panel saying "looking..." forever, and what tells the
     browser to close the connection instead of reconnecting and starting a
     second research run. */
  send(res, { type: 'done' })
  res.end()
}
