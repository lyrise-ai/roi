// ─────────────────────────────────────────────────────────────────────────────
// runs — how a V2 agent survives the interview.
//
// Neither V2 agent runs continuously. Both work while the user answers our
// questions, and most of that two or three minutes is a person typing. So an
// agent here does not sit in a loop. It WAKES on something happening — an
// answer submitted, a research finding landing, the interview ending — takes one
// short turn, saves what it now knows, and sleeps.
//
// Being event-driven and being durable are not two features. They are the same
// one. A loop that sleeps between events cannot hold its memory in a variable,
// because Vercel throws the server away between requests and no request may run
// longer than 300 seconds anyway. Its memory has to live in a row.
//
// This file is that row, and the one wake around it. It knows nothing about
// either agent — the caller builds its own agent, with its own tools and
// instructions, and hands it over. Research and report get separate rows and
// meet through findings, never through shared memory.
//
// ── Stopping to ask a person something ───────────────────────────────────────
//
// One agent does this, in one place. The report agent, once the interview is
// over and the person is on the wait screen, either reveals their report or
// says that something it cannot do without is missing and asks for it. It never
// interrupts the interview itself, and the research agent never asks anything.
//
// A tool with no `execute` halts the loop: the model calls it, there is nothing
// to run, so there is no result to send back and the loop cannot continue. That
// unanswered call IS the question. We show it, the answer comes back as the tool
// result, and the next wake carries on from exactly there.
//
// It waits as long as it takes. The question lives in the row, so closing the
// tab and coming back tomorrow shows the question again, not a report built
// without it. The only two ways out are answering and skipping.
//
// Same shape as LangGraph's `interrupt()`, without leaving TypeScript.
//
// ── Two layers, exactly like pages.ts ────────────────────────────────────────
//
//   memory   — a Map, lasting one server run. Fluid Compute reuses warm
//              instances, so consecutive wakes during one interview usually land
//              on the same one and never read the database at all.
//   Supabase — between runs, when the instance is cold.
//
// One read at the start of a wake, one write at the end. NOT one per turn — a
// wake is often several turns, and they all happen in memory.
//
// The database is not the cost worth worrying about. It is in Stockholm and our
// functions are in US East, so a query is 150-250ms against a model turn of two
// to eight seconds: about 3-5% of a wake. Redis was considered and rejected —
// it is not durable, which is the entire point of the row, and it is a second
// service to run to save that 150ms.
//
// ── The cost that IS worth worrying about: row size ──────────────────────────
//
// `messages` grows every turn, and the whole thing is read and rewritten on
// every wake. One `readPage` result is up to 8,000 characters; fifteen of those
// and the row is hundreds of kilobytes being moved back and forth all interview.
//
// So PAGE TEXT NEVER GOES IN `messages`. Pages already live in
// `research_artifacts`. A message carries the URL and the tool reads it back out
// of that cache for free. Same rule for anything else bulky.
//
// It is a rule about the tools the caller writes, so this file cannot enforce
// it — but it can notice. `save` measures the row and raises the alarm above
// MAX_ROW_BYTES. It still saves: a big row is bad, and losing somebody's report
// halfway through their interview is worse.
// ─────────────────────────────────────────────────────────────────────────────

import type { Agent, ModelMessage, ToolSet } from 'ai'

import { EVENTS } from '@/src/lib/analytics'
import { captureServer } from '@/src/lib/posthog-server'

/* How long a row lives. Generous, because the chat is this same agent waking up
   again days later — it is not a cache, it is the report's memory. */
export const RUN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/* The alarm line, not a limit. A healthy run obeying the page-text rule stays
   far under this; crossing it means something bulky got into `messages`. */
export const MAX_ROW_BYTES = 256 * 1024

/* Which agent this is. Two agents, two rows, one report — and this is also how
   we tell their costs apart in PostHog. */
export type RunKind = 'research' | 'report'

/* A question the agent asked and nobody has answered yet. This is a halted tool
   call, held open. */
export type Asking = {
  /* The id the model gave the call. The answer has to come back under it or the
     provider rejects the whole message list. */
  callId: string
  tool: string
  /* Whatever the agent passed the asking tool — the question, the options. The
     shape belongs to the tool, so this file does not look inside it. */
  input: unknown
  askedAt: string
}

/* Everything one agent knows, and the whole of what we save. */
export type Run = {
  id: string
  kind: RunKind
  messages: ModelMessage[]
  /* Whatever the agent's owner keeps beside the messages — the report agent puts
     its ReportState here. Same rule: small, no page text. */
  data: Record<string, unknown>
  asking: Asking | null
  /* Things that happened while a question was standing. The agent could not be
     given a turn to hear them, so they wait here and go in with the answer. */
  waiting: string[]
  /* How many times it has woken, and what that has cost. Kept on the row so the
     answer survives the run, which is the only way to measure cost per wake. */
  wakes: number
  tokensIn: number
  tokensOut: number
}

/* What one wake did. */
export type Wake = {
  run: Run
  /* Set when this wake ended halted on a question. Show it to the person; the
     answer comes back through the next `wake` call. */
  asking: Asking | null
  /* The agent's final output, when its own `output` schema produced one. Absent
     when it halted on a question, or when the caller's agent has no schema. */
  output?: unknown
  /* True when the agent finished its turn rather than halting on a question. */
  finished: boolean
  /* What this wake alone cost, for the caller that wants to show or cap it. */
  cost: { in: number; out: number; ms: number }
}

function emptyRun(id: string, kind: RunKind): Run {
  return {
    id,
    kind,
    messages: [],
    data: {},
    asking: null,
    waiting: [],
    wakes: 0,
    tokensIn: 0,
    tokensOut: 0,
  }
}

// -- The two layers ----------------------------------------------------------

const memory = new Map<string, Run>()

/* Empties the memory layer. For tests, and for `npm run dev`, where an old run
   would otherwise survive a hot reload. Does not touch Supabase. */
export function clearRunCache(): void {
  memory.clear()
}

function supabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

/* Reads the row. Unlike `pages.ts`, a failure here is NOT harmless — losing this
   loses the agent's memory — so it says so out loud rather than swallowing it.
   It still returns null instead of throwing, because starting the agent again
   from nothing is a worse report, and a thrown error is no report at all. */
async function readRow(id: string): Promise<Run | null> {
  if (!supabaseConfigured()) return null
  try {
    const { getSupabaseAdmin } = await import('../../supabaseAdmin')
    const { data, error } = await getSupabaseAdmin()
      .from('agent_runs')
      .select('id, kind, state, expires_at')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    if (new Date(data.expires_at).getTime() <= Date.now()) return null
    const state = data.state ?? {}
    return {
      id: data.id,
      kind: data.kind,
      messages: Array.isArray(state.messages) ? state.messages : [],
      data: state.data ?? {},
      asking: state.asking ?? null,
      waiting: Array.isArray(state.waiting) ? state.waiting : [],
      wakes: state.wakes ?? 0,
      tokensIn: state.tokensIn ?? 0,
      tokensOut: state.tokensOut ?? 0,
    }
  } catch (error) {
    console.error(
      `[run ${id}] could not read its state: ${message(error)}. Starting from nothing.`,
    )
    return null
  }
}

/* Loads a run. Memory first — on a warm instance mid-interview that is every
   wake after the first. */
export async function loadRun(id: string, kind: RunKind): Promise<Run> {
  const held = memory.get(id)
  if (held) return held

  const row = await readRow(id)
  const run = row ?? emptyRun(id, kind)
  memory.set(id, run)
  return run
}

/* Saves a run to both layers. Called once at the end of a wake, never per turn.

   The Supabase half is allowed to fail without ending the run: the wake already
   happened, and refusing to hand back its result would throw away work that is
   still correct in memory. It is logged at error, because unlike a missing web
   page this is a real fault. */
export async function saveRun(run: Run): Promise<void> {
  memory.set(run.id, run)

  const state = {
    messages: run.messages,
    data: run.data,
    asking: run.asking,
    waiting: run.waiting,
    wakes: run.wakes,
    tokensIn: run.tokensIn,
    tokensOut: run.tokensOut,
  }

  const bytes = Buffer.byteLength(JSON.stringify(state))
  if (bytes > MAX_ROW_BYTES) {
    /* Something bulky is in `messages` — almost always a tool handing back page
       text instead of a URL. Loud on purpose: it gets worse every wake, and it
       is invisible until somebody looks. */
    console.error(
      `[run ${run.id}] state is ${Math.round(bytes / 1024)}KB after ${run.wakes} wakes, ` +
        `over the ${Math.round(MAX_ROW_BYTES / 1024)}KB line. Something bulky is in messages — ` +
        `page text belongs in research_artifacts, and messages should carry the URL.`,
    )
    captureServer(EVENTS.AGENT_RUN_TOO_BIG, {
      kind: run.kind,
      bytes,
      wakes: run.wakes,
      messages: run.messages.length,
    })
  }

  if (!supabaseConfigured()) return
  try {
    const { getSupabaseAdmin } = await import('../../supabaseAdmin')
    await getSupabaseAdmin()
      .from('agent_runs')
      .upsert(
        {
          id: run.id,
          kind: run.kind,
          state,
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + RUN_TTL_MS).toISOString(),
        },
        { onConflict: 'id' },
      )
  } catch (error) {
    console.error(`[run ${run.id}] could not save its state: ${message(error)}`)
  }
}

// -- Questions ---------------------------------------------------------------
//
// Only the report agent asks anything, and only in one place: after the
// interview is over, while the person waits for their report. At that point it
// either has enough and reveals the report, or it decides something it cannot do
// without is missing and asks for it.
//
// There is no timer on the answer, and no giving up. A question is the only
// thing on their screen, so there are exactly two endings:
//
//   they answer it  — the answer goes back as the tool result
//   they skip it    — told plainly that the report will be weaker for it
//
// Closing the tab is not a third ending. The question lives in the row, so
// coming back tomorrow shows the question again, not a report built without it.
// Nothing here expires it.

/* What we tell the agent when the person skipped the question.

   This is the tool result the agent reads, so it has to close the subject, not
   just report it. A sentence that reads as "not yet" invites it to ask the same
   thing again on the same screen, and they never get out of it. */
function whenSkipped(): string {
  return [
    'They skipped that question. They were told the report would be weaker',
    'without the answer and went ahead anyway, so build it now with what you',
    'have. Do not ask again on this screen.',
    '',
    'Anywhere their answer would have made a section better, say so in the',
    'report. Do not quietly guess and present the guess as known.',
    '',
    'You may ask once more in the chat, after they have seen the report. Not',
    'before.',
  ].join('\n')
}

// -- One wake ----------------------------------------------------------------

/* What woke the agent.

     a string      — something happened; here it is
     { answering } — the person answered the question it stopped on
     { skipped }   — the person chose not to answer it */
export type Nudge = string | { answering: string } | { skipped: true }

export type WakeOptions = {
  /* Passed straight through to the agent, so the caller can watch turns go by
     without this file knowing what a turn contains. */
  onStepFinish?: (step: unknown) => void
  abortSignal?: AbortSignal
}

/* Wake an agent, give it one turn, save, and go back to sleep.

   Never throws. This sits on the path that makes a report, and nothing there is
   allowed to throw — a broken wake comes back as `finished: false` with the run
   unchanged apart from what it had already done. */
export async function wake(
  id: string,
  kind: RunKind,
  agent: Agent<never, ToolSet, any>,
  nudge: Nudge,
  options: WakeOptions = {},
): Promise<Wake> {
  const startedAt = Date.now()
  const run = await loadRun(id, kind)

  /* Which of the three kinds this is, worked out once. TypeScript cannot follow
     `'skipped' in nudge` further down on its own: the string case is gone by
     then, but only because of an early return it cannot reason through. */
  const event = typeof nudge === 'string' ? nudge : null
  const skipped = typeof nudge !== 'string' && 'skipped' in nudge
  const answer =
    typeof nudge !== 'string' && 'answering' in nudge ? nudge.answering : null

  /* Something happened while a question was still standing — on the wait screen
     that means research finishing late, not the person doing something else.

     The agent is parked until they reply, so it is not given a turn: we send the
     whole conversation on every call, and the provider rejects one where the
     agent asked for a tool and nothing answered. Waking it here would force us
     to close the question to make the conversation legal, and the question would
     be gone.

     So the event waits its turn instead. Nothing is dropped, and no model call
     is spent on something the agent cannot act on yet. */
  if (run.asking && event !== null) {
    run.waiting.push(event)
    await saveRun(run)
    return {
      run,
      asking: run.asking,
      finished: false,
      cost: { in: 0, out: 0, ms: Date.now() - startedAt },
    }
  }

  if (run.asking) {
    run.messages.push({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: run.asking.callId,
          toolName: run.asking.tool,
          output: {
            type: 'text',
            value: skipped ? whenSkipped() : answer,
          },
        },
      ],
    })
    run.asking = null
  } else if (event !== null) {
    run.messages.push({ role: 'user', content: event })
  } else if (answer !== null) {
    /* An answer with no question open. Nothing is broken — it is what a stale
       browser tab sends after the question was already closed elsewhere — so it
       goes in as an ordinary message rather than being thrown away. */
    run.messages.push({ role: 'user', content: answer })
  } else {
    /* Skipping a question that is no longer open. There is nothing to say and
       nothing to decide, so we do not pay for a turn to say it. */
    return {
      run,
      asking: null,
      finished: true,
      cost: { in: 0, out: 0, ms: Date.now() - startedAt },
    }
  }

  /* Whatever arrived while it was parked, handed over now that it can act. */
  if (run.waiting.length > 0) {
    run.messages.push({ role: 'user', content: run.waiting.join('\n') })
    run.waiting = []
  }

  run.wakes += 1

  let result: any
  try {
    result = await agent.generate({
      messages: run.messages,
      abortSignal: options.abortSignal,
      onStepFinish: options.onStepFinish,
    } as never)
  } catch (error) {
    console.error(`[run ${id}] wake ${run.wakes} broke: ${message(error)}`)
    captureServer(EVENTS.AGENT_WAKE, {
      kind,
      wakes: run.wakes,
      broke: true,
      error: message(error),
      duration_ms: Date.now() - startedAt,
    })
    /* Saved anyway. The messages we added are still a true account of what
       happened, and the next wake should not repeat them. */
    await saveRun(run)
    return {
      run,
      asking: null,
      finished: false,
      cost: { in: 0, out: 0, ms: Date.now() - startedAt },
    }
  }

  run.messages.push(...(result.response?.messages ?? []))

  const tokensIn = result.totalUsage?.inputTokens ?? 0
  const tokensOut = result.totalUsage?.outputTokens ?? 0
  run.tokensIn += tokensIn
  run.tokensOut += tokensOut

  run.asking = halted(result)

  await saveRun(run)

  const ms = Date.now() - startedAt
  captureServer(EVENTS.AGENT_WAKE, {
    kind,
    wakes: run.wakes,
    steps: result.steps?.length ?? 0,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    asking: Boolean(run.asking),
    messages: run.messages.length,
    duration_ms: ms,
  })

  return {
    run,
    asking: run.asking,
    output: outputOf(result),
    finished: !run.asking,
    cost: { in: tokensIn, out: tokensOut, ms },
  }
}

/* Finds the tool call the loop stopped on, if it stopped on one.

   A tool with no `execute` produces a call with no result, so the loop cannot
   continue — that mismatch is how we recognise a question rather than the end of
   a turn. There is at most one, because the loop stops at the first. */
function halted(result: any): Asking | null {
  const calls = result?.toolCalls ?? []
  if (calls.length === 0) return null
  const answered = new Set(
    (result?.toolResults ?? []).map((r: any) => r.toolCallId),
  )
  const open = calls.find((call: any) => !answered.has(call.toolCallId))
  if (!open) return null
  return {
    callId: open.toolCallId,
    tool: open.toolName,
    input: open.input,
    askedAt: new Date().toISOString(),
  }
}

/* The agent's structured output, when it has one. Reading it throws when the
   turn ended on a tool call instead of an answer, which is the ordinary case for
   a halt, so this is not an error worth reporting. */
function outputOf(result: any): unknown {
  try {
    return result?.output
  } catch {
    return undefined
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
