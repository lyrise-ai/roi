// Cascade and contract tests for S1 (LYR-187 R2 / LYR-195).
//
// Everything here runs against a stubbed global fetch, so no test touches PDL,
// the network, or the shared Supabase project. What's pinned down is the
// behaviour the rest of the system depends on: the cascade stops at the first
// hit, every attempt is logged, all-sources-failed is ERROR and never NONE,
// and revenue cannot reach a rendering path.
//
//   Run:  node --test src/lib/roi/research/scouts/__tests__/s1.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, afterEach, before, beforeEach, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let runS1
let clearArtifactCache
let tmpDir
const realFetch = globalThis.fetch

before(async () => {
  const cacheRoot = path.resolve(
    here,
    '../../../../../..',
    'node_modules/.cache',
  )
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 's1-test-'))

  /* One bundle, not two. The artifact cache holds module-level state, so
     bundling s1.ts and artifactCache.ts separately would give the test a
     `clearArtifactCache` that clears a different Map than the one S1 reads —
     and a page cached by an earlier test would leak into the next. A single
     re-exporting entry keeps it to one module graph. */
  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { runS1 } from ${JSON.stringify(path.join(here, '../s1.ts'))}\n` +
      `export { clearArtifactCache } from ${JSON.stringify(path.join(here, '../../artifactCache.ts'))}\n`,
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
  ;({ runS1, clearArtifactCache } = await import(pathToFileURL(outfile).href))
})

after(() => {
  globalThis.fetch = realFetch
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

let calls
function stubFetch(handler) {
  calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    return handler(String(url), init)
  }
}

const json = (body) => ({ ok: true, status: 200, json: async () => body })
const html = (body) => ({ ok: true, status: 200, text: async () => body })

/* A minimal PDL company-enrich response, in PDL's own shape: `size` as a band,
   country as a lowercase name, revenue under `inferred_revenue`. */
const PDL_HIT = {
  name: 'acme law',
  size: '11-50',
  employee_count: 34,
  industry: 'law practice',
  founded: 2011,
  location: {
    name: 'dubai, dubai, united arab emirates',
    country: 'united arab emirates',
  },
  inferred_revenue: 4_500_000,
}

const LAW_FIRM_PAGE = `
  <html><body>
    <h1>Acme Law</h1>
    <p>Our practice areas include commercial litigation and corporate advisory.</p>
    <footer>Level 12, Al Fattan Tower, Dubai, United Arab Emirates</footer>
  </body></html>`

beforeEach(() => {
  clearArtifactCache()
  delete process.env.PDL_API_KEY
  delete process.env.FIRECRAWL_API_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterEach(() => {
  globalThis.fetch = realFetch
})

// ── the keyless path — the one that runs today ───────────────────────────────

test('with no PDL key, S1 falls through to the site and still routes', async () => {
  stubFetch(() => html(LAW_FIRM_PAGE))

  const result = await runS1('acmelaw.com')

  assert.equal(result.scout, 'S1')
  assert.equal(result.facts.country.value, 'AE')
  assert.equal(result.facts.region.value, 'GCC')
  assert.equal(result.facts.vertical.value, 'legal')
  /* A homepage doesn't state headcount, so the honest answer is PARTIAL with
     sizeBand null — not a fabricated band. */
  assert.equal(result.facts.sizeBand, null)
  assert.equal(result.status, 'PARTIAL')
  assert.match(result.notes, /undetermined: sizeBand/)
})

test('a missing key is logged as a miss, not silently skipped', async () => {
  stubFetch(() => html(LAW_FIRM_PAGE))

  const { sourcesAttempted } = await runS1('acmelaw.com')

  assert.deepEqual(
    sourcesAttempted.map((a) => [a.source, a.outcome]),
    [
      ['pdl', 'miss'],
      ['site', 'hit'],
    ],
  )
  assert.ok(sourcesAttempted.every((a) => typeof a.ms === 'number'))
})

test('site facts point at the page a prospect can actually open', async () => {
  stubFetch(() => html(LAW_FIRM_PAGE))

  const { facts } = await runS1('acmelaw.com')

  for (const key of ['country', 'region', 'vertical']) {
    assert.equal(facts[key].provenance.sourceUrl, 'https://acmelaw.com/')
    assert.equal(facts[key].provenance.sourceType, 'site')
  }
})

test('a generic TLD is resolved from the footer, not assumed American', async () => {
  stubFetch(() => html(LAW_FIRM_PAGE))

  const { facts } = await runS1('acmelaw.com')

  assert.equal(facts.country.value, 'AE')
  assert.equal(facts.region.value, 'GCC')
})

// ── the cascade ──────────────────────────────────────────────────────────────

test('PDL wins when it has a key and a match, and the site is never fetched', async () => {
  process.env.PDL_API_KEY = 'pdl-test'
  stubFetch((url) => {
    if (url.includes('peopledatalabs')) return json(PDL_HIT)
    return html(LAW_FIRM_PAGE)
  })

  const result = await runS1('acmelaw.com')

  assert.equal(result.status, 'FULL')
  assert.equal(result.facts.country.value, 'AE')
  assert.equal(result.facts.region.value, 'GCC')
  assert.equal(result.facts.sizeBand.value, '11-50')
  assert.equal(result.facts.headcount.value, 34)
  assert.equal(result.facts.founded.value, 2011)
  assert.equal(result.facts.vertical.value, 'legal')
  assert.equal(calls.length, 1, 'the cascade must stop at the first hit')
  assert.deepEqual(
    result.sourcesAttempted.map((a) => [a.source, a.outcome]),
    [['pdl', 'hit']],
  )
})

test('PDL 404 is a miss and the site tier takes over', async () => {
  process.env.PDL_API_KEY = 'pdl-test'
  stubFetch((url) => {
    if (url.includes('peopledatalabs'))
      return { ok: false, status: 404, json: async () => ({}) }
    return html(LAW_FIRM_PAGE)
  })

  const result = await runS1('acmelaw.com')

  assert.deepEqual(
    result.sourcesAttempted.map((a) => [a.source, a.outcome]),
    [
      ['pdl', 'miss'],
      ['site', 'hit'],
    ],
  )
  assert.equal(result.status, 'PARTIAL')
})

test('a throwing provider is an error on its own row, not a failed run', async () => {
  process.env.PDL_API_KEY = 'pdl-test'
  stubFetch((url) => {
    if (url.includes('peopledatalabs')) throw new Error('ECONNRESET')
    return html(LAW_FIRM_PAGE)
  })

  const result = await runS1('acmelaw.com')

  assert.equal(result.sourcesAttempted[0].outcome, 'error')
  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.facts.vertical.value, 'legal')
  assert.match(result.notes, /pdl: ECONNRESET/)
})

test('enrichment facts are capped at medium confidence', async () => {
  /* PDL publishes a dataset_version but no per-record date, so we cannot know
     how old the snapshot is. Claiming high confidence in an undated cache is
     the exact credibility damage the redesign exists to avoid. */
  process.env.PDL_API_KEY = 'pdl-test'
  stubFetch(() => json(PDL_HIT))

  const { facts } = await runS1('acmelaw.com')

  assert.equal(facts.country.provenance.confidence, 'medium')
  assert.equal(facts.sizeBand.provenance.confidence, 'medium')
  assert.equal(facts.country.provenance.sourceType, 'enrichment')
})

// ── revenue containment ──────────────────────────────────────────────────────

test('revenue is kept but is not a Fact, so it cannot reach a rendering path', async () => {
  process.env.PDL_API_KEY = 'pdl-test'
  stubFetch(() => json(PDL_HIT))

  const { facts } = await runS1('acmelaw.com')

  assert.equal(facts.internal.annualRevenueUsd, 4_500_000)

  /* The structural guarantee: anything that displays facts iterates
     Fact-shaped values, and revenue is not one. No key on the result carries
     the revenue figure inside a `value`/`provenance` pair. */
  const factShaped = Object.entries(facts).filter(
    ([, v]) => v && typeof v === 'object' && 'value' in v && 'provenance' in v,
  )
  assert.ok(factShaped.length > 0)
  for (const [key, value] of factShaped) {
    assert.notEqual(value.value, 4_500_000, `revenue leaked through ${key}`)
  }
  assert.ok(!JSON.stringify(factShaped).includes('4500000'))
})

// ── failure behaviour ────────────────────────────────────────────────────────

test('everything failing is ERROR, never NONE', async () => {
  /* A company always has a country. NONE would assert we established it has
     none, which is nonsense — we simply failed to look. */
  process.env.PDL_API_KEY = 'pdl-test'
  stubFetch(() => {
    throw new Error('network down')
  })

  const result = await runS1('acmelaw.com')

  assert.equal(result.status, 'ERROR')
  assert.notEqual(result.status, 'NONE')
  assert.deepEqual(result.facts, {
    country: null,
    region: null,
    vertical: null,
    sizeBand: null,
  })
  assert.equal(result.sourcesAttempted.length, 2)
})

test('an unreachable site with no enrichment is ERROR', async () => {
  stubFetch(() => ({ ok: false, status: 403, text: async () => 'Forbidden' }))

  const result = await runS1('altamimi.com')

  assert.equal(result.status, 'ERROR')
})

test('a junk domain is ERROR before any fetch is attempted', async () => {
  stubFetch(() => html(LAW_FIRM_PAGE))

  const result = await runS1('not a domain')

  assert.equal(result.status, 'ERROR')
  assert.equal(calls.length, 0)
  assert.match(result.notes, /not a usable domain/)
})

test('a page we can read but cannot classify still routes at low confidence', async () => {
  /* The card's "country undeterminable" row: PARTIAL, region OTHER, and the
     low confidence is what tells downstream to use default routing. */
  stubFetch(() =>
    html('<html><body><p>We help businesses grow.</p></body></html>'),
  )

  const result = await runS1('mystery.io')

  assert.equal(result.status, 'PARTIAL')
  assert.equal(result.facts.country, null)
  assert.equal(result.facts.region.value, 'OTHER')
  assert.equal(result.facts.region.provenance.confidence, 'low')
  assert.equal(result.facts.region.provenance.sourceUrl, 'https://mystery.io/')
})

test('runS1 never throws, whatever the network does', async () => {
  for (const behaviour of [
    () => {
      throw new Error('boom')
    },
    () => ({
      ok: true,
      status: 200,
      text: async () => {
        throw new Error('bad body')
      },
    }),
    () => ({
      ok: true,
      status: 200,
      json: async () => null,
      text: async () => '',
    }),
  ]) {
    clearArtifactCache()
    stubFetch(behaviour)
    const result = await runS1('acmelaw.com')
    assert.ok(['FULL', 'PARTIAL', 'ERROR'].includes(result.status))
  }
})

// ── contract shape ───────────────────────────────────────────────────────────

test('the result carries the coverage fields the aggregator reads', async () => {
  stubFetch(() => html(LAW_FIRM_PAGE))

  const result = await runS1('acmelaw.com')

  assert.equal(result.scout, 'S1')
  assert.equal(typeof result.durationMs, 'number')
  assert.equal(result.costUsd, 0)
  assert.ok(Array.isArray(result.sourcesAttempted))
  for (const attempt of result.sourcesAttempted) {
    assert.ok(['hit', 'miss', 'blocked', 'error'].includes(attempt.outcome))
  }
})

test('the four routing keys are always present, even on total failure', async () => {
  /* Nullable values, non-optional keys: a consumer cannot forget to handle a
     field, and S1 cannot invent one to fill a gap. */
  stubFetch(() => {
    throw new Error('down')
  })

  const { facts } = await runS1('acmelaw.com')

  for (const key of ['country', 'region', 'vertical', 'sizeBand']) {
    assert.ok(key in facts, `${key} must always be a key`)
  }
})

test('LinkedIn is never called from any path', async () => {
  process.env.PDL_API_KEY = 'pdl-test'
  stubFetch((url) => {
    if (url.includes('peopledatalabs'))
      return { ok: false, status: 404, json: async () => ({}) }
    return html(LAW_FIRM_PAGE)
  })

  await runS1('acmelaw.com')

  assert.ok(!calls.some((url) => url.toLowerCase().includes('linkedin')))
})
