// Tests for search discovery and, mostly, for its identity guards
// (LYR-187 R9 / LYR-212).
//
// A search result is a GUESS about identity. Acting on the wrong one is worse
// than finding nothing: it attaches another company's job postings to this
// prospect and states them as fact, with a working source link. Every pair
// asserted below was observed in the real measurement run against 22 firms.
//
//   Run:  node --test src/lib/roi/research/__tests__/search.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, afterEach, before, beforeEach, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let s
let tmpDir
const realFetch = globalThis.fetch

before(async () => {
  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'search-test-'))
  const outfile = path.join(tmpDir, 'search.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../search.ts')],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  s = await import(pathToFileURL(outfile).href)
})

after(() => {
  globalThis.fetch = realFetch
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  delete process.env.TAVILY_API_KEY
  delete process.env.BRAVE_API_KEY
})

afterEach(() => {
  globalThis.fetch = realFetch
})

// ── the wrong-company guard ──────────────────────────────────────────────────

test('a different company on a shared ATS host is rejected', () => {
  /* Observed: searching for stalawfirm.com returned Simpson Thacher &
     Bartlett's Workday board. A substring match on the shared "law" would have
     accepted it and published another firm's vacancies to this prospect. */
  assert.equal(
    s.classifyHost(
      'https://stblaw.wd1.myworkdayjobs.com/careers',
      'stalawfirm.com',
    ),
    'other',
  )
})

test('a different company on a similar brand name is rejected', () => {
  /* All observed in the real run. Same brand token, different legal entity. */
  assert.equal(
    s.classifyHost('https://tamimicontracting.com/jobs', 'tamimi.com'),
    'other',
  )
  assert.equal(
    s.classifyHost('https://www.farrercapital.com/careers', 'farrer.co.uk'),
    'other',
  )
  assert.equal(
    s.classifyHost('https://bakertilly.ca/careers', 'bakertilly.com'),
    'other',
  )
  assert.equal(
    s.classifyHost('https://pkfsmithcooper.teamtailor.com/jobs', 'pkfuae.com'),
    'other',
  )
})

test("the company's own subdomains are accepted", () => {
  /* These genuinely are the same company, and a naive same-host-only rule
     would have thrown away the best result for two firms. */
  assert.equal(
    s.classifyHost(
      'https://careers.osborneclarke.com/jobs',
      'osborneclarke.com',
    ),
    'own',
  )
  assert.equal(
    s.classifyHost('https://jobs.rsmus.com/openings', 'rsmus.com'),
    'own',
  )
  assert.equal(
    s.classifyHost('https://www.mishcon.com/careers', 'mishcon.com'),
    'own',
  )
})

test('a matching ATS board is accepted', () => {
  for (const [url, domain] of [
    ['https://bakertilly.wd5.myworkdayjobs.com/BTCareers', 'bakertilly.com'],
    [
      'https://morganlewis.wd5.myworkdayjobs.com/morganlewis',
      'morganlewis.com',
    ],
    ['https://rsm.wd1.myworkdayjobs.com/RSMCareers', 'rsmus.com'],
    ['https://tamimi.talentera.com/', 'tamimi.com'],
    ['https://shoosmiths.allhires.com/vacancies', 'shoosmiths.com'],
  ]) {
    assert.equal(s.classifyHost(url, domain), 'ats', `${url} for ${domain}`)
  }
})

test('slugMatchesCompany requires a prefix, not a shared fragment', () => {
  assert.equal(s.slugMatchesCompany('bakertilly', 'bakertilly'), true)
  assert.equal(s.slugMatchesCompany('rsm', 'rsmus'), true)
  /* The dangerous ones. */
  assert.equal(s.slugMatchesCompany('stblaw', 'stalawfirm'), false)
  assert.equal(s.slugMatchesCompany('pkfsmithcooper', 'pkfuae'), false)
  assert.equal(s.slugMatchesCompany('acme', 'zenith'), false)
  /* Too short to mean anything. */
  assert.equal(s.slugMatchesCompany('ab', 'abcdef'), false)
  assert.equal(s.slugMatchesCompany('', 'acmelaw'), false)
})

test('companyToken reduces a domain to its brand label', () => {
  assert.equal(s.companyToken('acmelaw.com'), 'acmelaw')
  assert.equal(s.companyToken('acmelaw.co.uk'), 'acmelaw')
  assert.equal(s.companyToken('www.acmelaw.com'), 'acmelaw')
  assert.equal(s.companyToken('https://acmelaw.ae/careers'), 'acmelaw')
})

// ── LinkedIn and the aggregators ─────────────────────────────────────────────

test('LinkedIn is blocked from every path', () => {
  for (const url of [
    'https://www.linkedin.com/jobs/view/123',
    'https://uk.linkedin.com/company/mishcon-de-reya/jobs',
    'https://ae.linkedin.com/company/hadefpartners',
    'https://lnkd.in/abc',
  ]) {
    assert.equal(s.classifyHost(url, 'mishcon.com'), 'blocked', url)
  }
})

test('LinkedIn cannot survive ranking even when it is the only result', () => {
  /* The rule is a filter, not a preference. Proxycurl was shut down in July
     2025 after LinkedIn's federal lawsuit; we sell to law firms. */
  const ranked = s.rankHits(
    [
      {
        url: 'https://uk.linkedin.com/company/mishcon-de-reya/jobs',
        title: 'Mishcon jobs',
      },
      { url: 'https://www.linkedin.com/jobs/view/999', title: 'Paralegal' },
    ],
    'mishcon.com',
  )
  assert.deepEqual(ranked, [])
})

test('scraped-content aggregators are blocked', () => {
  for (const url of [
    'https://www.dubaicareer.ae/al-tamimi-jobs',
    'https://jobsarchives.com/careers/al-tamimi-company-careers',
    'https://www.dubailivejobs.com/job/al-tamimi-careers',
    'https://www.indeed.com/q-law-firm-jobs.html',
    'https://www.glassdoor.com/Jobs/x.htm',
  ]) {
    assert.equal(s.classifyHost(url, 'tamimi.com'), 'blocked', url)
  }
})

// ── ranking ──────────────────────────────────────────────────────────────────

test('an ATS board outranks the company careers page', () => {
  /* The ATS is where dated individual postings live; the careers page is
     usually prose about culture. */
  const ranked = s.rankHits(
    [
      { url: 'https://www.bakertilly.com/careers', title: 'Careers' },
      {
        url: 'https://bakertilly.wd5.myworkdayjobs.com/BTCareers',
        title: 'Baker Tilly Careers',
      },
    ],
    'bakertilly.com',
  )
  assert.equal(
    ranked[0].url,
    'https://bakertilly.wd5.myworkdayjobs.com/BTCareers',
  )
  assert.equal(ranked.length, 2)
})

test('a non-vacancy page on the own domain is dropped', () => {
  const ranked = s.rankHits(
    [
      { url: 'https://www.mishcon.com/about-us', title: 'About' },
      { url: 'https://www.mishcon.com/people/jane', title: 'Jane' },
      { url: 'https://www.mishcon.com/careers', title: 'Careers' },
    ],
    'mishcon.com',
  )
  assert.deepEqual(
    ranked.map((r) => r.url),
    ['https://www.mishcon.com/careers'],
  )
})

test('rankHits dedupes and respects the cap', () => {
  const hits = Array.from({ length: 10 }, (_, i) => ({
    url: `https://www.mishcon.com/careers/role-${i}`,
    title: `Role ${i}`,
  }))
  hits.push(hits[0])
  const ranked = s.rankHits(hits, 'mishcon.com', 3)
  assert.equal(ranked.length, 3)
  assert.equal(new Set(ranked.map((r) => r.url)).size, 3)
})

test('rankHits survives junk input', () => {
  assert.deepEqual(s.rankHits(null, 'acmelaw.com'), [])
  assert.deepEqual(s.rankHits([], 'acmelaw.com'), [])
  assert.deepEqual(
    s.rankHits([{ url: '' }, { url: 'not a url' }, {}], 'acmelaw.com'),
    [],
  )
})

// ── the search clients ───────────────────────────────────────────────────────

test('no key configured returns nothing rather than throwing', async () => {
  /* The system must still run, and be testable, with nothing configured. */
  let called = false
  globalThis.fetch = async () => {
    called = true
    return { ok: true, json: async () => ({}) }
  }
  assert.deepEqual(await s.webSearch('anything'), [])
  assert.equal(called, false, 'must not call a search API without a key')
})

test('Brave is used when Tavily returns nothing', async () => {
  process.env.TAVILY_API_KEY = 'tv-test'
  process.env.BRAVE_API_KEY = 'br-test'
  const calls = []
  globalThis.fetch = async (url) => {
    calls.push(String(url))
    if (String(url).includes('tavily')) {
      return { ok: true, json: async () => ({ results: [] }) }
    }
    return {
      ok: true,
      json: async () => ({
        web: {
          results: [{ url: 'https://acmelaw.com/careers', title: 'Careers' }],
        },
      }),
    }
  }

  const hits = await s.webSearch('acme law careers')

  assert.equal(hits.length, 1)
  assert.equal(hits[0].url, 'https://acmelaw.com/careers')
  assert.ok(calls[0].includes('tavily'))
  assert.ok(calls[1].includes('brave'))
})

test('a search engine erroring falls through rather than failing the run', async () => {
  process.env.TAVILY_API_KEY = 'tv-test'
  process.env.BRAVE_API_KEY = 'br-test'
  globalThis.fetch = async (url) => {
    if (String(url).includes('tavily')) throw new Error('tavily down')
    return {
      ok: true,
      json: async () => ({
        web: { results: [{ url: 'https://acmelaw.com/jobs', title: 'Jobs' }] },
      }),
    }
  }
  const hits = await s.webSearch('acme')
  assert.equal(hits[0].url, 'https://acmelaw.com/jobs')
})

test('both engines failing returns [] and never throws', async () => {
  process.env.TAVILY_API_KEY = 'tv-test'
  process.env.BRAVE_API_KEY = 'br-test'
  globalThis.fetch = async () => {
    throw new Error('network down')
  }
  assert.deepEqual(await s.webSearch('acme'), [])
})

test('discoveryQuery names the company and does not leak the TLD', () => {
  const q = s.discoveryQuery('hadefpartners.com', 'legal')
  assert.match(q, /hadefpartners/)
  assert.match(q, /vacanc/i)
  assert.match(q, /legal/)
  assert.ok(!q.includes('.com'))
})

// ── following a listing through to the actual jobs ───────────────────────────

test('jobLinksFrom finds job detail links in HTML', () => {
  /* The real shape, taken from tamimi.talentera.com. */
  const html = `
    <a href="/en/bahrain/jobs/mid-level-corporate-m-a-associate-3-to-5-pqe-bahrain-1100020087/">Associate</a>
    <a href="/en/iraq/jobs/secretary-1100020408/">Secretary</a>
    <a href="/en/about">About</a>
    <a href="/jobs">All jobs</a>`

  const links = s.jobLinksFrom(html, 'https://tamimi.talentera.com/jobs')

  assert.equal(links.length, 2)
  assert.ok(links.every((l) => l.includes('talentera.com')))
  assert.ok(links.some((l) => l.includes('secretary-1100020408')))
  /* `/about` is not a vacancy and `/jobs` is the listing itself. */
  assert.ok(!links.some((l) => l.endsWith('/about')))
})

test('jobLinksFrom reads markdown too', () => {
  /* Firecrawl returns markdown, a plain fetch returns HTML, and callers should
     not have to know which produced the bytes. */
  const md = `
    [Legal Assistant](https://acmelaw.com/careers/legal-assistant-2291)
    [Our people](https://acmelaw.com/people)`

  const links = s.jobLinksFrom(md, 'https://acmelaw.com/careers')

  assert.deepEqual(links, ['https://acmelaw.com/careers/legal-assistant-2291'])
})

test('jobLinksFrom never leaves the host', () => {
  /* A careers page links to LinkedIn, the press page and a cookie policy.
     Following off-host walks straight into the sources this module exists to
     exclude. */
  const html = `
    <a href="https://uk.linkedin.com/jobs/view/paralegal-12345">Paralegal on LinkedIn</a>
    <a href="https://www.indeed.com/viewjob?jk=abc-12345">Indeed</a>
    <a href="/careers/paralegal-dubai-2024">Paralegal</a>`

  const links = s.jobLinksFrom(html, 'https://acmelaw.com/careers')

  assert.deepEqual(links, ['https://acmelaw.com/careers/paralegal-dubai-2024'])
})

test('jobLinksFrom ignores index pages without a real slug', () => {
  const html = `
    <a href="/careers">Careers</a>
    <a href="/jobs">Jobs</a>
    <a href="/vacancies/">Vacancies</a>`
  assert.deepEqual(s.jobLinksFrom(html, 'https://acmelaw.com/careers'), [])
})

test('jobLinksFrom dedupes, caps and survives junk', () => {
  const many = Array.from(
    { length: 20 },
    (_, i) => `<a href="/jobs/role-name-${i}">Role</a>`,
  ).join('')
  assert.equal(
    s.jobLinksFrom(many + many, 'https://acmelaw.com/jobs', 5).length,
    5,
  )
  assert.deepEqual(s.jobLinksFrom('', 'https://acmelaw.com/jobs'), [])
  assert.deepEqual(s.jobLinksFrom(null, 'https://acmelaw.com/jobs'), [])
  assert.deepEqual(s.jobLinksFrom('<a href="/jobs/x-1">x</a>', 'not a url'), [])
})
