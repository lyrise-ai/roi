/* The server side of the scan panel (LYR-199 R6).

   Until this route existed, /v2 had none: the panel was a timer walking through
   a canned list. This is the connection to the real research system.

   It keeps the connection open and pushes findings down it, rather than
   answering once, because the research takes 5 to 20 seconds and the panel has
   to fill while the prospect answers their next question. Waiting for the whole
   run before showing anything would turn a panel that fills up into a spinner.

   One agent behind it. It picks what to fetch, writes each finding down the
   moment it has one, and that is what comes down this connection. There used to
   be two model calls here — one to collect, one to work out what it meant. Now
   there is one.

   This route makes no model calls of its own and does no picking, sorting or
   rewording of what it passes on. The sentences are already written and already
   pointed at a page we really read.

   It is a GET on purpose: the browser's own reader for this kind of stream only
   speaks GET. The alternative is writing our own stream parser for a request
   with one parameter in it.

   The mechanics — the headers, how we send, and treating the client hanging up
   as the stop signal — copy pages/api/roi-agent.js, which has been carrying
   real generations for months. Nothing here invents its own way of
   cancelling. */
import { research } from '@/src/lib/roi/research/agent'
import { cleanDomain } from '@/src/lib/roi/research/search'

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
     domain. This is where outside input enters, and `cleanDomain` is the same
     check the agent runs its own input through. A typo is rejected here
     rather than turning into a request for a nonsense address. */
  const domain = cleanDomain(String(req.query.domain ?? ''))
  if (!domain) {
    res.status(400).json({ error: 'invalid_domain' })
    return
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')

  /* The client hanging up is how we know to stop. A prospect who closes the tab
     or goes back to the company screen should not leave an agent fetching pages
     and running up a bill for a panel nobody is looking at. The run has its own
     cap of 20 turns, so this limits the spend rather than the run itself. */
  let gone = false
  res.on('close', () => {
    if (!res.writableEnded) gone = true
  })

  try {
    const found = await research(domain, {
      onFinding: (finding) => {
        if (gone) return
        send(res, { type: 'finding', finding })
      },
      /* What it is doing right now. "Reading their careers page" is a better
         thing to look at than a spinner, and it costs nothing — the agent tells
         us after every turn anyway. */
      onStep: (step) => {
        if (gone || step.using.length === 0) return
        send(res, { type: 'step', using: step.using })
      },
    })

    /* Why we could not find more, in their words. Sent at the end because it is
       only true at the end. This is the part that stops a quiet panel reading as
       "this company does nothing" when it really means "we could not reach their
       site". */
    if (!gone && found.gaps.length > 0) {
      send(res, { type: 'gaps', gaps: found.gaps })
    }
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
