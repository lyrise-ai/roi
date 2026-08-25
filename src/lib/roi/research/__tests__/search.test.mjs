// Tests for finding job pages by search, and mostly for the checks that stop us
// using the wrong company's pages (LYR-187 R9 / LYR-212).
//
// A search result is a GUESS about who a page belongs to. Acting on a wrong
// guess is worse than finding nothing: it attaches another company's job
// postings to this prospect and states them as fact, with a working link
// underneath. Every pair checked below actually happened in the measurement run
// against 22 firms.
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

// -- the check that keeps other companies out --------------------------------

test('a different company on a shared ATS host is rejected', () => {
  /* Observed: searching for stalawfirm.com returned Simpson Thacher &
     Bartlett's Workday board. A substring match on the shared "law" would have
     accepted it and published another firm's vacancies to this prospect. */
  assert.equal(
    s.whoseSite(
      'https://stblaw.wd1.myworkdayjobs.com/careers',
      'stalawfirm.com',
    ),
    'stranger',
  )
})

test('a different company on a similar brand name is rejected', () => {
  /* All observed in the real run. Same brand token, different legal entity. */
  assert.equal(
    s.whoseSite('https://tamimicontracting.com/jobs', 'tamimi.com'),
    'stranger',
  )
  assert.equal(
    s.whoseSite('https://www.farrercapital.com/careers', 'farrer.co.uk'),
    'stranger',
  )
  assert.equal(
    s.whoseSite('https://bakertilly.ca/careers', 'bakertilly.com'),
    'stranger',
  )
  assert.equal(
    s.whoseSite('https://pkfsmithcooper.teamtailor.com/jobs', 'pkfuae.com'),
    'stranger',
  )
})

test("the company's own subdomains are accepted", () => {
  /* These genuinely are the same company, and a naive same-host-only rule
     would have thrown away the best result for two firms. */
  assert.equal(
    s.whoseSite('https://careers.osborneclarke.com/jobs', 'osborneclarke.com'),
    'theirs',
  )
  assert.equal(
    s.whoseSite('https://jobs.rsmus.com/openings', 'rsmus.com'),
    'theirs',
  )
  assert.equal(
    s.whoseSite('https://www.mishcon.com/careers', 'mishcon.com'),
    'theirs',
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
    assert.equal(s.whoseSite(url, domain), 'board', `${url} for ${domain}`)
  }
})

test('couldBeTheirs requires a prefix, not a shared fragment', () => {
  assert.equal(s.couldBeTheirs('bakertilly', 'bakertilly'), true)
  assert.equal(s.couldBeTheirs('rsm', 'rsmus'), true)
  /* The dangerous ones. */
  assert.equal(s.couldBeTheirs('stblaw', 'stalawfirm'), false)
  assert.equal(s.couldBeTheirs('pkfsmithcooper', 'pkfuae'), false)
  assert.equal(s.couldBeTheirs('acme', 'zenith'), false)
  /* Too short to mean anything. */
  assert.equal(s.couldBeTheirs('ab', 'abcdef'), false)
  assert.equal(s.couldBeTheirs('', 'acmelaw'), false)
})

test('nameFromDomain reduces a domain to its brand label', () => {
  assert.equal(s.nameFromDomain('acmelaw.com'), 'acmelaw')
  assert.equal(s.nameFromDomain('acmelaw.co.uk'), 'acmelaw')
  assert.equal(s.nameFromDomain('www.acmelaw.com'), 'acmelaw')
  assert.equal(s.nameFromDomain('https://acmelaw.ae/careers'), 'acmelaw')
})

// ── LinkedIn and the aggregators ─────────────────────────────────────────────

test('republishers are labelled second-hand, not refused', () => {
  /* They used to be refused outright. They are read now, because sometimes a
     firm's only public jobs are there — hlbhamt.com's two auditor roles are on
     GulfTalent and Indeed and nowhere on its own site. The label is what
     survives, so the agent knows to check the company name on the page. */
  for (const url of [
    'https://www.linkedin.com/jobs/view/123',
    'https://uk.linkedin.com/company/mishcon-de-reya/jobs',
    'https://lnkd.in/abc',
    'https://www.indeed.com/q-law-firm-jobs.html',
    'https://www.glassdoor.com/Jobs/x.htm',
    'https://www.gulftalent.com/uae/jobs/auditor',
    'https://jobsarchives.com/careers/al-tamimi-company-careers',
  ]) {
    assert.equal(s.whoseSite(url, 'mishcon.com'), 'secondHand', url)
  }
})

test('a republished vacancy survives ranking, marked and ranked last', () => {
  const ranked = s.pickTheirPages(
    [
      { url: 'https://www.gulftalent.com/uae/jobs/auditor', title: 'Auditor' },
      { url: 'https://hlbhamt.com/careers', title: 'Careers' },
    ],
    'hlbhamt.com',
  )

  assert.equal(ranked.length, 2)
  /* Their own page first. A republisher is the one most likely to be about a
     different company, so it never leads. */
  assert.equal(ranked[0].url, 'https://hlbhamt.com/careers')
  assert.equal(ranked[0].secondHand, false)
  assert.equal(ranked[1].secondHand, true)
})

test('a stranger is still a stranger', () => {
  /* Removing the block did not make everything fair game. A page we cannot tie
     to this company at all is still dropped, because attaching another firm's
     vacancy to this prospect is worse than finding nothing. */
  assert.equal(
    s.whoseSite('https://someotherfirm.com/careers', 'hlbhamt.com'),
    'stranger',
  )
  assert.deepEqual(
    s.pickTheirPages(
      [{ url: 'https://someotherfirm.com/careers', title: 'Careers' }],
      'hlbhamt.com',
    ),
    [],
  )
})

// ── ranking ──────────────────────────────────────────────────────────────────

test('an ATS board outranks the company careers page', () => {
  /* The ATS is where dated individual postings live; the careers page is
     usually prose about culture. */
  const ranked = s.pickTheirPages(
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

test('every page on their own domain is kept, whatever it is about', () => {
  /* This test used to assert the opposite — that only the careers page
     survived. That was right when searching was only ever hunting vacancies.
     The agent researches services, offices and systems now, and an About page
     on their own domain is theirs whichever way you look at it. */
  const ranked = s.pickTheirPages(
    [
      { url: 'https://www.mishcon.com/about-us', title: 'About' },
      { url: 'https://www.mishcon.com/people/jane', title: 'Jane' },
      { url: 'https://www.mishcon.com/careers', title: 'Careers' },
    ],
    'mishcon.com',
  )
  assert.equal(ranked.length, 3)
})

test('pickTheirPages dedupes and respects the cap', () => {
  const hits = Array.from({ length: 10 }, (_, i) => ({
    url: `https://www.mishcon.com/careers/role-${i}`,
    title: `Role ${i}`,
  }))
  hits.push(hits[0])
  const ranked = s.pickTheirPages(hits, 'mishcon.com', 3)
  assert.equal(ranked.length, 3)
  assert.equal(new Set(ranked.map((r) => r.url)).size, 3)
})

test('pickTheirPages survives junk input', () => {
  assert.deepEqual(s.pickTheirPages(null, 'acmelaw.com'), [])
  assert.deepEqual(s.pickTheirPages([], 'acmelaw.com'), [])
  assert.deepEqual(
    s.pickTheirPages([{ url: '' }, { url: 'not a url' }, {}], 'acmelaw.com'),
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

test('searchFor names the company and does not leak the TLD', () => {
  const q = s.searchFor('hadefpartners.com', 'legal')
  assert.match(q, /hadefpartners/)
  assert.match(q, /vacanc/i)
  assert.match(q, /legal/)
  assert.ok(!q.includes('.com'))
})

// ── following a listing through to the actual jobs ───────────────────────────

test('jobLinks finds job detail links in HTML', () => {
  /* The real shape, taken from tamimi.talentera.com. */
  const html = `
    <a href="/en/bahrain/jobs/mid-level-corporate-m-a-associate-3-to-5-pqe-bahrain-1100020087/">Associate</a>
    <a href="/en/iraq/jobs/secretary-1100020408/">Secretary</a>
    <a href="/en/about">About</a>
    <a href="/jobs">All jobs</a>`

  const links = s.jobLinks(html, 'https://tamimi.talentera.com/jobs')

  assert.equal(links.length, 2)
  assert.ok(links.every((l) => l.includes('talentera.com')))
  assert.ok(links.some((l) => l.includes('secretary-1100020408')))
  /* `/about` is not a vacancy and `/jobs` is the listing itself. */
  assert.ok(!links.some((l) => l.endsWith('/about')))
})

test('jobLinks reads markdown too', () => {
  /* Firecrawl returns markdown, a plain fetch returns HTML, and callers should
     not have to know which produced the bytes. */
  const md = `
    [Legal Assistant](https://acmelaw.com/careers/legal-assistant-2291)
    [Our people](https://acmelaw.com/people)`

  const links = s.jobLinks(md, 'https://acmelaw.com/careers')

  assert.deepEqual(links, ['https://acmelaw.com/careers/legal-assistant-2291'])
})

test('jobLinks never leaves the host', () => {
  /* A careers page links to LinkedIn, the press page and a cookie policy.
     Following off-host walks straight into the sources this module exists to
     exclude. */
  const html = `
    <a href="https://uk.linkedin.com/jobs/view/paralegal-12345">Paralegal on LinkedIn</a>
    <a href="https://www.indeed.com/viewjob?jk=abc-12345">Indeed</a>
    <a href="/careers/paralegal-dubai-2024">Paralegal</a>`

  const links = s.jobLinks(html, 'https://acmelaw.com/careers')

  assert.deepEqual(links, ['https://acmelaw.com/careers/paralegal-dubai-2024'])
})

test('jobLinks ignores index pages without a real slug', () => {
  const html = `
    <a href="/careers">Careers</a>
    <a href="/jobs">Jobs</a>
    <a href="/vacancies/">Vacancies</a>`
  assert.deepEqual(s.jobLinks(html, 'https://acmelaw.com/careers'), [])
})

test('jobLinks dedupes, caps and survives junk', () => {
  const many = Array.from(
    { length: 20 },
    (_, i) => `<a href="/jobs/role-name-${i}">Role</a>`,
  ).join('')
  assert.equal(s.jobLinks(many + many, 'https://acmelaw.com/jobs', 5).length, 5)
  assert.deepEqual(s.jobLinks('', 'https://acmelaw.com/jobs'), [])
  assert.deepEqual(s.jobLinks(null, 'https://acmelaw.com/jobs'), [])
  assert.deepEqual(s.jobLinks('<a href="/jobs/x-1">x</a>', 'not a url'), [])
})

// ── LYR-221: the alias, the subdomain, and the named query ───────────────────

test('a host the company declares canonical is its own, not a stranger', () => {
  /* Observed: kingsleynapley.com redirects to, and declares rel=canonical on,
     kingsleynapley.co.uk. Search returned the real careers page and we threw
     it away as a different company. */
  assert.equal(
    s.whoseSite(
      'https://www.kingsleynapley.co.uk/careers',
      'kingsleynapley.com',
    ),
    'stranger',
    'without the alias it is still correctly unattributable',
  )
  assert.equal(
    s.whoseSite(
      'https://www.kingsleynapley.co.uk/careers',
      'kingsleynapley.com',
      ['kingsleynapley.co.uk'],
    ),
    'theirs',
  )
})

test('an alias does not open the door to a different member firm', () => {
  /* bakertilly.com declares no canonical, so no alias is ever produced for it
     and bakertilly.ca stays rejected. Even handed an unrelated alias, a host
     that matches neither is still `other`. */
  assert.equal(
    s.whoseSite('https://bakertilly.ca/careers', 'bakertilly.com'),
    'stranger',
  )
  assert.equal(
    s.whoseSite('https://bakertilly.ca/careers', 'bakertilly.com', [
      'bakertilly.co.uk',
    ]),
    'stranger',
  )
})

test('pickTheirPages keeps a vacancy page on an aliased host', () => {
  const hits = [
    { url: 'https://www.kingsleynapley.co.uk/careers', title: 'Careers' },
  ]
  assert.equal(rankLen(hits, 'kingsleynapley.com'), 0)
  assert.equal(rankLen(hits, 'kingsleynapley.com', ['kingsleynapley.co.uk']), 1)
})

function rankLen(hits, domain, aliases = []) {
  return s.pickTheirPages(hits, domain, 4, aliases).length
}

test('a careers SUBDOMAIN is a vacancy URL even with an empty path', () => {
  /* careers.bdo.co.uk classified `own` and was then dropped because its
     pathname is bare "/". It was the right page for one of the six zero-yield
     domains in the measurement. */
  assert.equal(s.looksLikeJobs('https://careers.bdo.co.uk'), true)
  assert.equal(s.looksLikeJobs('https://jobs.acmelaw.com/'), true)
  assert.equal(s.looksLikeJobs('https://www.acmelaw.com/about'), false)
  assert.equal(s.looksLikeJobs('https://acmelaw.com/'), false)
})

test('pickTheirPages now keeps the careers subdomain it used to drop', () => {
  const hits = [{ url: 'https://careers.bdo.co.uk', title: 'Careers at BDO' }]
  assert.equal(rankLen(hits, 'bdo.co.uk'), 1)
})

test('searchFor prefers the real company name over the domain token', () => {
  /* "gowlingwlg" returned a German packaging company four times; "Gowling WLG"
     returned four usable hits. */
  const withName = s.searchFor('gowlingwlg.com', 'legal', 'Gowling WLG')
  assert.match(withName, /"Gowling WLG"/)
  assert.ok(!withName.includes('"gowlingwlg"'))

  const withoutName = s.searchFor('gowlingwlg.com', 'legal')
  assert.match(withoutName, /"gowlingwlg"/, 'falls back to the old behaviour')
})

test('searchFor refuses a name that would break the phrase match', () => {
  /* A quote in the name would terminate the quoted phrase early. */
  assert.match(
    s.searchFor('acmelaw.com', 'legal', 'Acme "The Firm" Law'),
    /"acmelaw"/,
  )
  assert.match(s.searchFor('acmelaw.com', 'legal', '  '), /"acmelaw"/)
  assert.match(s.searchFor('acmelaw.com', 'legal', 'A'), /"acmelaw"/)
})

// -- careersLinks (LYR-220) -----------------------------------------
// The recall half of finding a careers page. Its ONLY job is to not lose the
// real link; deciding which candidate to follow is a model call in the S2
// scout. So every case below asks "did we keep it", never "did we keep only
// it" — a false positive costs a few tokens, a false negative costs the whole
// company.

test('keeps the careers paths our fixed probe list missed', () => {
  const html = `
    <a href="/careers-at-hlb-hamt/">Careers at HLB HAMT</a>
    <a href="/career/">Career</a>
    <a href="/en/careers.html">Careers</a>
  `
  const urls = s.careersLinks(html, 'https://hlbhamt.com/').map((c) => c.url)

  /* All three are real addresses of firms we scored as having no postings.
     `/career/` is a one-character miss from `/careers`; `/en/careers.html` has
     both a language prefix and a file extension. */
  assert.ok(urls.includes('https://hlbhamt.com/careers-at-hlb-hamt/'))
  assert.ok(urls.includes('https://hlbhamt.com/career/'))
  assert.ok(urls.includes('https://hlbhamt.com/en/careers.html'))
})

test('keeps a careers link whose address says nothing about jobs', () => {
  /* The link TEXT is the evidence here. Judging by address alone is what made
     the old probe list narrow, and no list of paths would ever guess `/s/17`. */
  const found = s.careersLinks(
    '<a href="/s/17">Join our team</a>',
    'https://example.com/',
  )
  assert.equal(found.length, 1)
  assert.equal(found[0].text, 'Join our team')
})

test('keeps /join-us, which VACANCY_PATH does not match', () => {
  /* S2 has always probed /join-us. Prefiltering candidates with `looksLikeJobs`
     would have made this step narrower than the guess list it replaces. */
  assert.equal(s.looksLikeJobs('https://example.com/join-us'), false)
  const urls = s
    .careersLinks('<a href="/join-us">Work here</a>', 'https://example.com/')
    .map((c) => c.url)
  assert.deepEqual(urls, ['https://example.com/join-us'])
})

test('never leaves the company domain', () => {
  /* R8. A homepage links to its LinkedIn careers page too, and following that
     is the one thing this system must never do. */
  const html = `
    <a href="https://www.linkedin.com/company/acme/jobs/">Careers</a>
    <a href="https://acme.com/careers">Careers</a>
  `
  const urls = s.careersLinks(html, 'https://acme.com/').map((c) => c.url)
  assert.deepEqual(urls, ['https://acme.com/careers'])
})

test('reads markdown links, because Firecrawl returns markdown', () => {
  const urls = s
    .careersLinks('see [Careers](/vacancies) today', 'https://acme.com/')
    .map((c) => c.url)
  assert.deepEqual(urls, ['https://acme.com/vacancies'])
})

test('drops links that mention nothing about work', () => {
  const html = '<a href="/about">About</a><a href="/contact">Contact us</a>'
  assert.deepEqual(s.careersLinks(html, 'https://acme.com/'), [])
})

test('their own pages are kept even when the address says nothing about jobs', () => {
  /* Measured: a search for `site:hlbhamt.com "Accounts Payable Outsourcing"`
     returned eight of their own service pages and every one was dropped,
     because the old rule required the address to mention jobs. Search stopped
     being jobs-only when the agent started researching services too. */
  const ranked = s.pickTheirPages(
    [
      {
        url: 'https://hlbhamt.com/services/accounts-payable-outsourcing',
        title: 'Accounts Payable Outsourcing',
      },
      { url: 'https://hlbhamt.com/about-us', title: 'About us' },
    ],
    'hlbhamt.com',
  )

  assert.equal(ranked.length, 2)
})

test('a republisher still has to look like a vacancy', () => {
  /* Their own site earns the benefit of the doubt. A site that republishes
     other people's listings does not — its non-job pages are not about this
     company at all. */
  assert.deepEqual(
    s.pickTheirPages(
      [
        {
          url: 'https://www.indeed.com/cmp/Some-Firm/reviews',
          title: 'Reviews',
        },
      ],
      'hlbhamt.com',
    ),
    [],
  )
})
