// Tests for how a V2 agent survives the interview.
//
// The things checked here are the ones that cannot be checked by reading the
// code, because they are all about what happens BETWEEN requests:
//
//   A run survives the request that started it going away. Vercel throws the
//   server away; the agent's memory has to be in the row, not in a variable.
//
//   A warm instance never reads the database. That is the whole reason for the
//   memory layer, and it is invisible unless something counts the queries.
//
//   One read and one write per WAKE, not per turn. A wake is often several
//   turns and they all happen in memory.
//
//   An agent can stop on a question and carry on from the answer. A tool with no
//   `execute` leaves a call with no result, and that is the question.
//
//   A question waits as long as it takes, and skipping it still builds a
//   report. There is no timer — closing the tab shows the question again.
//
//   The row stays small across a long run. This is the rule that quietly rots
//   the first time somebody finds it convenient to put page text in `messages`.
//
// The Supabase client is stubbed with a fake table so the row round trip is
// really exercised, rather than falling back to memory only.
//
//   Run:  node --test src/lib/roi/v2/__tests__/runs.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, beforeEach, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let wake
let loadRun
let saveRun
let clearRunCache
let MAX_ROW_BYTES
let tmpDir

/* The fake database. `rows` is what has been written; `reads` and `writes` count
   the queries, which is how the "warm instance never reads" test can tell the
   difference between a memory hit and a lucky one. */
const db = { rows: new Map(), reads: 0, writes: 0 }

before(async () => {
  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'runs-test-'))

  /* Stands in for @supabase/supabase-js. Only the four calls runs.ts makes are
     implemented — select/eq/maybeSingle and upsert. Anything else should fail
     loudly rather than quietly returning undefined. */
  const stub = path.join(tmpDir, 'supabase-stub.mjs')
  fs.writeFileSync(
    stub,
    `export function createClient() {
       return {
         from(table) {
           if (table !== 'agent_runs') throw new Error('unexpected table ' + table)
           return {
             select() {
               return {
                 eq(_column, id) {
                   return {
                     async maybeSingle() {
                       globalThis.__db.reads += 1
                       const row = globalThis.__db.rows.get(id)
                       return { data: row ?? null, error: null }
                     },
                   }
                 },
               }
             },
             async upsert(row) {
               globalThis.__db.writes += 1
               globalThis.__db.rows.set(row.id, JSON.parse(JSON.stringify(row)))
               return { error: null }
             },
           }
         },
       }
     }\n`,
  )

  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { wake, loadRun, saveRun, clearRunCache, MAX_ROW_BYTES } from ${JSON.stringify(
      path.join(here, '../runs.ts'),
    )}\n`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    packages: 'external',
    /* Bundled in, not external, so the stub really replaces it. */
    external: ['ai', 'zod', 'posthog-node'],
    alias: { '@supabase/supabase-js': stub },
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })

  globalThis.__db = db
  /* runs.ts only talks to Supabase when both of these are set. */
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://stub.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key'
  ;({ wake, loadRun, saveRun, clearRunCache, MAX_ROW_BYTES } = await import(
    pathToFileURL(outfile).href
  ))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  clearRunCache()
  db.rows.clear()
  db.reads = 0
  db.writes = 0
})

/* A stand-in agent. `turns` is a list of what each successive generate() call
   should hand back, so a test can say "first wake asks a question, second wake
   finishes" without a model. */
function fakeAgent(turns) {
  let at = 0
  return {
    seen: [],
    async generate({ messages }) {
      this.seen.push(structuredClone(messages))
      const turn = turns[Math.min(at, turns.length - 1)]
      at += 1
      return turn
    },
  }
}

/* One ordinary turn: the agent said something and stopped. */
function answered(text, output) {
  return {
    response: {
      messages: [{ role: 'assistant', content: [{ type: 'text', text }] }],
    },
    toolCalls: [],
    toolResults: [],
    steps: [{}],
    totalUsage: { inputTokens: 100, outputTokens: 20 },
    output,
  }
}

/* A turn that halts on a question: a tool call with no matching result, which is
   exactly what a tool with no `execute` leaves behind. */
function asks(question) {
  return {
    response: {
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'askThePerson',
              input: { question },
            },
          ],
        },
      ],
    },
    toolCalls: [
      { toolCallId: 'call-1', toolName: 'askThePerson', input: { question } },
    ],
    toolResults: [],
    steps: [{}],
    totalUsage: { inputTokens: 100, outputTokens: 30 },
  }
}

// ── It survives the request that started it ─────────────────────────────────

test('a run rebuilds from its row after the server is thrown away', async () => {
  const agent = fakeAgent([answered('Noted.')])
  await wake('run-a', 'report', agent, 'They have 12 people.')

  /* Vercel throwing the server away, exactly: memory gone, row still there. */
  clearRunCache()

  const back = await loadRun('run-a', 'report')
  assert.equal(back.messages.length, 2)
  assert.equal(back.messages[0].content, 'They have 12 people.')
  assert.equal(back.wakes, 1)
  assert.equal(back.tokensIn, 100)
})

test('a warm instance answers from memory and never reads the database', async () => {
  const agent = fakeAgent([answered('One.'), answered('Two.')])
  await wake('run-b', 'report', agent, 'first')
  const readsAfterFirst = db.reads

  await wake('run-b', 'report', agent, 'second')

  /* The point of the memory layer. Consecutive wakes during one interview land
     on the same warm instance, so the second one must cost no query at all. */
  assert.equal(db.reads, readsAfterFirst)
})

test('one write per wake, not per turn', async () => {
  /* Three turns inside one generate call — the agent used its tools twice and
     then answered. That is still one wake, so still one write. */
  const threeTurns = answered('Done.')
  threeTurns.steps = [{}, {}, {}]

  const agent = fakeAgent([threeTurns])
  await wake('run-c', 'report', agent, 'go')

  assert.equal(db.writes, 1)
})

// ── Stopping to ask a person something ──────────────────────────────────────

test('an agent halts on a question and carries on from the answer', async () => {
  const agent = fakeAgent([
    asks('How many invoices a week?'),
    answered('Thanks — about 200 then.'),
  ])

  const first = await wake('run-d', 'report', agent, 'interview started')
  assert.equal(first.finished, false)
  assert.deepEqual(first.asking, {
    callId: 'call-1',
    tool: 'askThePerson',
    input: { question: 'How many invoices a week?' },
    askedAt: first.asking.askedAt,
  })

  /* The row remembers the open question across the gap. */
  clearRunCache()

  const second = await wake('run-d', 'report', agent, { answering: '200' })
  assert.equal(second.finished, true)
  assert.equal(second.asking, null)

  /* The answer went back as the result of the call the agent made, under the
     same id. Anything else and the provider rejects the whole message list. */
  const sent = agent.seen[1]
  const toolMessage = sent.find((m) => m.role === 'tool')
  assert.equal(toolMessage.content[0].toolCallId, 'call-1')
  assert.equal(toolMessage.content[0].output.value, '200')
})

test('a question waits for as long as it takes — nothing expires it', async () => {
  /* There is no timer. Closing the tab is not an ending: the question is in the
     row, so coming back tomorrow shows the question, not a report built without
     it. */
  const agent = fakeAgent([asks('Which of these?'), answered('Right, then.')])
  await wake('run-e', 'report', agent, 'interview finished')

  /* A day passes and the server is long gone. */
  clearRunCache()
  const row = db.rows.get('run-e')
  row.state.asking.askedAt = new Date(
    Date.now() - 24 * 60 * 60 * 1000,
  ).toISOString()

  const back = await loadRun('run-e', 'report')
  assert.ok(back.asking, 'the question must still be standing')
  assert.equal(back.asking.callId, 'call-1')
})

test('skipping closes the question and the report gets built anyway', async () => {
  const agent = fakeAgent([
    asks('Which of these?'),
    answered('Fine — building it without that.'),
  ])
  await wake('run-h', 'report', agent, 'interview finished')

  const second = await wake('run-h', 'report', agent, { skipped: true })
  assert.equal(second.finished, true)
  assert.equal(second.asking, null)

  /* The agent is told something rather than left with an open call, and it is
     not the person's words — they did not say any. */
  const toolMessage = agent.seen[1].find((m) => m.role === 'tool')
  assert.ok(toolMessage, 'the halted call must be closed, not left open')
  assert.equal(
    typeof toolMessage.content[0].output.value,
    'string',
    'the agent must be told the question was skipped',
  )
})

test('an event arriving while a question stands waits, and costs nothing', async () => {
  /* Research finishing late. The agent is parked on a question, so giving it a
     turn would mean closing that question to make the conversation legal — and
     the question would be gone. So the event waits instead. */
  const agent = fakeAgent([asks('Which of these?'), answered('Noted, thanks.')])
  await wake('run-i', 'report', agent, 'interview finished')
  const callsBefore = agent.seen.length

  const parked = await wake('run-i', 'report', agent, 'Research finished.')

  assert.equal(agent.seen.length, callsBefore, 'no model call while parked')
  assert.ok(parked.asking, 'the question must still be standing')
  assert.equal(parked.cost.in, 0)

  /* And it is not lost — it arrives with the answer, once the agent can act. */
  await wake('run-i', 'report', agent, { answering: '200' })
  const sent = agent.seen[1]
  assert.ok(
    sent.some(
      (m) =>
        m.role === 'user' && String(m.content).includes('Research finished'),
    ),
    'what happened while parked must reach the agent',
  )
})

// ── The row stays small ─────────────────────────────────────────────────────

test('a long run stays well under the size line', async () => {
  /* Twenty wakes of ordinary agent chatter — roughly a whole interview plus a
     chat session afterwards. If page text ever gets into `messages` this is the
     test that fails. */
  const agent = fakeAgent([
    answered(
      'Read their careers page at https://acmelaw.com/careers — two paralegal ' +
        'adverts, both mentioning chasing client documents by hand.',
    ),
  ])

  for (let i = 0; i < 20; i += 1) {
    await wake('run-f', 'report', agent, `interview answer ${i}`)
  }

  const row = db.rows.get('run-f')
  const bytes = Buffer.byteLength(JSON.stringify(row.state))
  assert.ok(
    bytes < MAX_ROW_BYTES / 4,
    `a 20-wake run should be a small fraction of the ${MAX_ROW_BYTES} byte line, was ${bytes}`,
  )
})

// ── Nothing here throws ─────────────────────────────────────────────────────

test('a broken turn comes back as unfinished, and what was done is kept', async () => {
  const broken = {
    async generate() {
      throw new Error('the model call fell over')
    },
  }

  const result = await wake('run-g', 'report', broken, 'go')

  assert.equal(result.finished, false)
  assert.equal(result.asking, null)
  /* Saved regardless, so the next wake does not repeat what already happened. */
  assert.equal(db.writes, 1)
  assert.equal(result.run.messages.length, 1)
})
