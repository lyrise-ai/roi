// Tests for what the agent can do, and the two rules underneath it.
//
// The rules being checked here are the ones that cannot live in a prompt:
//
//   A failure always says WHY. The agent cannot decide whether to try a
//   different address unless it knows the site was slow rather than missing.
//   `stalawfirm.com` was written off as "genuinely unreachable" for a whole card
//   because we only ever said `null`.
//
//   A finding must point at a page we really opened. This is checked in code,
//   not asked for in the prompt, because a model can be talked past a prompt and
//   not past an `if`.
//
//   Run:  node --test src/lib/roi/research/__tests__/tools.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, afterEach, before, beforeEach, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let createTools
let startRun
let clearPageCache
let tmpDir
const realFetch = globalThis.fetch
let calls = []

before(async () => {
  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'tools-test-'))

  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { createTools, startRun } from ${JSON.stringify(path.join(here, '../tools.ts'))}\n` +
      `export { clearPageCache } from ${JSON.stringify(path.join(here, '../pages.ts'))}\n`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  ;({ createTools, startRun, clearPageCache } = await import(
    pathToFileURL(outfile).href
  ))
})

after(() => {
  globalThis.fetch = realFetch
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  clearPageCache()
  calls = []
})

afterEach(() => {
  globalThis.fetch = realFetch
})

function stubFetch(handler) {
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    return handler(String(url), init)
  }
}

const html = (body) => ({
  ok: true,
  status: 200,
  text: async () => body,
  json: async () => ({}),
})
const status = (code) => ({
  ok: false,
  status: code,
  text: async () => '',
  json: async () => ({}),
})

/* Long enough to clear the "this is a menu, not a page" check. */
const REAL_PAGE = `<h1>Careers</h1><p>${'We are hiring an auditor who will reconcile client ledgers and chase outstanding documents. '.repeat(6)}</p>`

// ── A failure says why ───────────────────────────────────────────────────────

test('a slow site is reported as slow, not as missing', async () => {
  /* This is the whole point. `stalawfirm.com` answers fine — its apex redirect
     just takes 20 seconds and we wait 15. Saying "nothing there" about a firm we
     never reached is how we ended up staying quiet about a company we could have
     spoken about. */
  stubFetch(() => {
    const error = new Error('The operation was aborted due to timeout')
    error.name = 'TimeoutError'
    throw error
  })

  const run = startRun('stalawfirm.com')
  const got = await createTools(run).readPage.execute({
    url: 'https://stalawfirm.com/en/careers.html',
    why: 'their vacancies',
  })

  assert.equal(got.ok, false)
  assert.equal(got.why, 'timeout')
  assert.match(got.detail, /did not answer/)
  /* And it says what to do about it. A slow site is recoverable, so telling the
     agent only that it failed would waste a firm we could have read. */
  assert.match(got.detail, /waitSeconds up to 45/)

  assert.equal(run.tried.length, 1)
  assert.equal(run.tried[0].got, 'timeout')
})

test('a site too slow even at the longest wait is a fact about their host', async () => {
  /* At the cap there is nothing left to suggest, so the message stops offering
     a retry and says what the timeout does and does not mean. */
  stubFetch(() => {
    const error = new Error('aborted')
    error.name = 'TimeoutError'
    throw error
  })

  const run = startRun('stalawfirm.com')
  const got = await createTools(run).readPage.execute({
    url: 'https://stalawfirm.com/',
    why: 'their homepage',
    waitSeconds: 45,
  })

  assert.equal(got.why, 'timeout')
  assert.match(got.detail, /longest we will wait/)
  assert.match(got.detail, /says nothing about the company/)
})

test('a slow page comes back when the agent waits longer', async () => {
  /* The recovery this exists for. `stalawfirm.com` answers in about 18 seconds;
     at our ordinary 15 we saw nothing and scored the firm empty. */
  let attempt = 0
  stubFetch(() => {
    attempt += 1
    if (attempt === 1) {
      const error = new Error('aborted')
      error.name = 'TimeoutError'
      throw error
    }
    return html(REAL_PAGE)
  })

  const run = startRun('stalawfirm.com')
  const tools = createTools(run)
  const url = 'https://stalawfirm.com/en/careers.html'

  const first = await tools.readPage.execute({ url, why: 'their vacancies' })
  assert.equal(first.ok, false)
  assert.equal(first.why, 'timeout')

  const second = await tools.readPage.execute({
    url,
    why: 'their vacancies',
    waitSeconds: 45,
  })
  assert.equal(second.ok, true, 'the second, patient read gets the page')

  /* Nothing is cached on a failure, so the retry really does fetch again. */
  assert.equal(attempt, 2)
  /* And the page is now citable, which is the whole point. */
  assert.equal(run.opened.size, 1)
})

test('the wait is clamped, so no call can hang the interview', async () => {
  stubFetch(() => html(REAL_PAGE))

  const run = startRun('acmelaw.com')
  const got = await createTools(run).readPage.execute({
    url: 'https://acmelaw.com/careers',
    why: 'their vacancies',
    waitSeconds: 9999,
  })

  /* It succeeds — the clamp is inside readPage, not a rejection — but the
     signal it used was capped at 45s, never 9999. */
  assert.equal(got.ok, true)
})

test('a 404 is told apart from a refusal, and costs no rescue fetch', async () => {
  /* A clean 404 is an answer. Sending it to the rescue fetcher spends a credit
     to be told again that the page is not there. */
  stubFetch(() => status(404))

  const run = startRun('acmelaw.com')
  const got = await createTools(run).readPage.execute({
    url: 'https://acmelaw.com/careers',
    why: 'their vacancies',
  })

  assert.equal(got.ok, false)
  assert.equal(got.why, 'not-found')
  assert.equal(calls.length, 1, 'exactly one request, no rescue attempt')
})

test('a republisher is read, not refused', async () => {
  /* This used to be blocked by host. It is not any more: hlbhamt.com's two
     auditor jobs live on GulfTalent and Indeed and nowhere on its own site, so
     refusing those meant never finding them. Judging whether the page is really
     about this company is the agent's job now, and the search result tells it
     which pages are second-hand. */
  stubFetch(() => html(REAL_PAGE))

  const run = startRun('hlbhamt.com')
  const got = await createTools(run).readPage.execute({
    url: 'https://www.gulftalent.com/uae/jobs/auditor-hlb-hamt',
    why: 'their auditor vacancy',
  })

  assert.equal(got.ok, true)
  assert.equal(calls.length, 1)
})

// ── A finding must point at a page we opened ────────────────────────────────

test('a finding pointing at a page we never opened is refused, with a reason', async () => {
  stubFetch(() => html(REAL_PAGE))

  const run = startRun('acmelaw.com')
  const tools = createTools(run)

  const got = await tools.noteFinding.execute({
    says: 'They are hiring two auditors',
    about: 'hiring',
    url: 'https://acmelaw.com/careers-we-never-read',
    quote: null,
  })

  assert.equal(got.ok, false)
  assert.equal(got.why, 'not-opened')
  /* Refused AND told what to do about it, so the agent can go and read the page
     rather than silently losing the finding. */
  assert.match(got.detail, /Read the page first/)
  assert.deepEqual(run.findings, [])
})

test('a finding on a page we did open is kept, and arrives straight away', async () => {
  stubFetch(() => html(REAL_PAGE))

  const streamed = []
  const run = startRun('acmelaw.com', (finding) => streamed.push(finding))
  const tools = createTools(run)

  const page = await tools.readPage.execute({
    url: 'https://acmelaw.com/career/',
    why: 'their vacancies',
  })
  assert.equal(page.ok, true)

  const got = await tools.noteFinding.execute({
    says: 'You are hiring an auditor whose first listed duty is reconciling client ledgers',
    about: 'hiring',
    url: page.url,
    quote: 'reconcile client ledgers',
  })

  assert.equal(got.ok, true)
  assert.equal(run.findings.length, 1)
  assert.equal(run.findings[0].quote, 'reconcile client ledgers')
  /* The panel gets it now, not when the run ends. */
  assert.equal(streamed.length, 1)
})

test('the same sentence about the same page twice is one finding', async () => {
  stubFetch(() => html(REAL_PAGE))

  const run = startRun('acmelaw.com')
  const tools = createTools(run)
  const page = await tools.readPage.execute({
    url: 'https://acmelaw.com/career/',
    why: 'their vacancies',
  })

  const note = {
    says: 'They are hiring an auditor',
    about: 'hiring',
    url: page.url,
    quote: null,
  }
  await tools.noteFinding.execute(note)
  await tools.noteFinding.execute(note)

  assert.equal(run.findings.length, 1)
})

// ── Counting ────────────────────────────────────────────────────────────────

test('two adverts on the same day are two seats, not someone leaving', async () => {
  /* bakertilly.com did exactly this in a real run — "consultant it advisory"
     twice, zero months apart — which would have read as turnover. */
  const run = startRun('bakertilly.com')
  const got = await createTools(run).countRepeats.execute({
    roles: [
      {
        role: 'consultant it advisory',
        dates: ['2026-03-03', '2026-03-03'],
      },
    ],
  })

  assert.deepEqual(got.repeats, [])
  assert.match(got.ignored[0], /two seats at once/)
})

test('the same role twice in a year counts, with the gap in months', async () => {
  const run = startRun('acmelaw.com')
  const got = await createTools(run).countRepeats.execute({
    roles: [{ role: 'paralegal', dates: ['2025-10-01', '2026-03-03'] }],
  })

  assert.equal(got.repeats.length, 1)
  assert.equal(got.repeats[0].count, 2)
  assert.equal(got.repeats[0].months, 5)
})

test('adverts more than a year apart are a firm that grew', async () => {
  const run = startRun('acmelaw.com')
  const got = await createTools(run).countRepeats.execute({
    roles: [{ role: 'paralegal', dates: ['2023-01-01', '2026-03-03'] }],
  })

  assert.deepEqual(got.repeats, [])
  assert.match(got.ignored[0], /more than a year apart/)
})

test('a role with no usable dates is never counted as a repeat', async () => {
  const run = startRun('acmelaw.com')
  const got = await createTools(run).countRepeats.execute({
    roles: [{ role: 'paralegal', dates: ['not a date', ''] }],
  })

  assert.deepEqual(got.repeats, [])
})
