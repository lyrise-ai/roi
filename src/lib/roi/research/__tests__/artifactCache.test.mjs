// Contract tests for the research artifact cache and the fact/scout types
// (LYR-187 R1 / LYR-194).
//
// What's locked in here is the behaviour the rest of the research system is
// allowed to assume: a cache hit is a cache hit, a failed fetch is null rather
// than an exception or an empty string, a stale entry is refetched, and a fact
// cannot carry a source we didn't verify.
//
// No test-runner dependency: Node's built-in `node:test` + `node:assert`.
// The modules are bundled with esbuild the same way
// src/lib/roi/v2/__tests__/miniCalculator.test.mjs does, with node_modules left
// external so the lazy Supabase import stays unresolved — it never fires here,
// because these tests run with no Supabase env and the cache degrades to
// memory-only, which is also how CI runs.
//
//   Run:  node --test src/lib/roi/research/__tests__/artifactCache.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, afterEach, before, beforeEach, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let cache
let types
let tmpDir
const realFetch = globalThis.fetch

before(async () => {
  /* Inside node_modules/.cache rather than os.tmpdir: the bundle keeps its
     bare imports external, so it has to sit somewhere Node can still resolve
     node_modules from. Gitignored, and removed again in `after`. */
  const cacheRoot = path.resolve(here, '../../../../..', 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'research-r1-test-'))
  const build = async (name) => {
    const outfile = path.join(tmpDir, `${name}.mjs`)
    await esbuild.build({
      entryPoints: [path.join(here, `../${name}.ts`)],
      bundle: true,
      packages: 'external',
      platform: 'node',
      format: 'esm',
      outfile,
      logLevel: 'silent',
    })
    return import(pathToFileURL(outfile).href)
  }
  cache = await build('artifactCache')
  types = await build('types')
})

after(() => {
  globalThis.fetch = realFetch
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

/* Every test drives the cache through a stubbed global fetch and a clean
   memory layer, so nothing here touches the network or the shared Supabase
   project. `calls` is the assertion surface for "did it refetch?". */
let calls
function stubFetch(handler) {
  calls = []
  globalThis.fetch = async (url, init) => {
    calls.push(String(url))
    return handler(String(url), init)
  }
}

function ok(body) {
  return { ok: true, status: 200, text: async () => body }
}

beforeEach(() => {
  cache.clearArtifactCache()
  cache.resetFirecrawlBudget()
  delete process.env.FIRECRAWL_API_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterEach(() => {
  globalThis.fetch = realFetch
})

// ── normalizeUrl ─────────────────────────────────────────────────────────────

test('normalizeUrl collapses spellings of the same page to one key', () => {
  const { normalizeUrl } = cache
  const expected = 'https://acmelaw.com/careers'

  assert.equal(normalizeUrl('https://ACMELAW.com/careers'), expected)
  assert.equal(normalizeUrl('https://acmelaw.com/careers/'), expected)
  assert.equal(normalizeUrl('https://acmelaw.com/careers#openings'), expected)
  assert.equal(
    normalizeUrl('https://acmelaw.com/careers?utm_source=linkedin'),
    expected,
  )
  assert.equal(normalizeUrl('  https://acmelaw.com/careers  '), expected)
})

test('normalizeUrl rejects anything that is not an http(s) URL', () => {
  const { normalizeUrl } = cache
  for (const bad of ['', '   ', 'not a url', 'ftp://x.com', 'javascript:x']) {
    assert.equal(normalizeUrl(bad), null, `expected null for ${bad}`)
  }
})

test('normalizeUrl keeps meaningful query params', () => {
  assert.equal(
    cache.normalizeUrl('https://boards.greenhouse.io/jobs?content=true'),
    'https://boards.greenhouse.io/jobs?content=true',
  )
})

// ── cache hits ───────────────────────────────────────────────────────────────

test('second request for the same URL is served from cache, not refetched', async () => {
  stubFetch(() => ok('<html>careers</html>'))

  const first = await cache.getArtifact('https://acmelaw.com/careers')
  const second = await cache.getArtifact('https://acmelaw.com/careers')

  assert.equal(first.content, '<html>careers</html>')
  assert.deepEqual(second, first)
  assert.equal(calls.length, 1, 'expected exactly one network call')
})

test('differently-spelled URLs for one page share a single fetch', async () => {
  stubFetch(() => ok('<html>careers</html>'))

  await cache.getArtifact('https://ACMELAW.com/careers/')
  await cache.getArtifact('https://acmelaw.com/careers?utm_source=x')

  assert.equal(calls.length, 1)
})

test('concurrent requests for the same URL collapse into one fetch', async () => {
  stubFetch(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
    return ok('<html>careers</html>')
  })

  const [a, b, c] = await Promise.all([
    cache.getArtifact('https://acmelaw.com/careers'),
    cache.getArtifact('https://acmelaw.com/careers'),
    cache.getArtifact('https://acmelaw.com/careers'),
  ])

  assert.equal(calls.length, 1)
  assert.equal(a.content, '<html>careers</html>')
  assert.deepEqual(b, a)
  assert.deepEqual(c, a)
})

test('a different URL is fetched rather than served from another entry', async () => {
  stubFetch((url) => ok(url))

  const careers = await cache.getArtifact('https://acmelaw.com/careers')
  const about = await cache.getArtifact('https://acmelaw.com/about')

  assert.equal(calls.length, 2)
  assert.notEqual(careers.content, about.content)
})

// ── TTL ──────────────────────────────────────────────────────────────────────

test('TTL is 7 days', () => {
  assert.equal(cache.ARTIFACT_TTL_MS, 7 * 24 * 60 * 60 * 1000)
})

test('an entry past its TTL is refetched rather than served stale', async (t) => {
  stubFetch(() => ok('<html>v1</html>'))
  const first = await cache.getArtifact('https://acmelaw.com/careers')
  assert.equal(first.content, '<html>v1</html>')
  assert.equal(calls.length, 1)

  /* Jump the clock past the TTL rather than sleeping. Only Date.now is moved:
     the cache reads it for expiry, so this is the whole of the staleness
     condition. */
  const realNow = Date.now
  t.after(() => {
    Date.now = realNow
  })
  const jumped = realNow() + cache.ARTIFACT_TTL_MS + 1
  Date.now = () => jumped

  stubFetch(() => ok('<html>v2</html>'))
  const second = await cache.getArtifact('https://acmelaw.com/careers')

  assert.equal(second.content, '<html>v2</html>')
  assert.equal(calls.length, 1, 'expected the stale entry to trigger a refetch')
})

test('an entry inside its TTL is still served from cache', async (t) => {
  stubFetch(() => ok('<html>v1</html>'))
  await cache.getArtifact('https://acmelaw.com/careers')

  const realNow = Date.now
  t.after(() => {
    Date.now = realNow
  })
  const jumped = realNow() + cache.ARTIFACT_TTL_MS - 60_000
  Date.now = () => jumped

  stubFetch(() => ok('<html>v2</html>'))
  const second = await cache.getArtifact('https://acmelaw.com/careers')

  assert.equal(second.content, '<html>v1</html>')
  assert.equal(calls.length, 0)
})

// ── null on failure ──────────────────────────────────────────────────────────
// The load-bearing property. null means "we could not read this page", which
// downstream is an ERROR (a gap we must stay quiet about) and never a NONE (a
// finding a writer may state). Anything that throws, or that reports '' as a
// success, breaks that distinction.

test('a non-2xx response returns null rather than throwing', async () => {
  stubFetch(() => ({ ok: false, status: 403, text: async () => 'Forbidden' }))
  assert.equal(await cache.getArtifact('https://altamimi.com/careers'), null)
})

test('a network error returns null rather than throwing', async () => {
  stubFetch(() => {
    throw new Error('ECONNREFUSED')
  })
  assert.equal(await cache.getArtifact('https://acmelaw.com/careers'), null)
})

test('a timeout returns null rather than throwing', async () => {
  stubFetch(() => {
    const err = new Error('The operation was aborted due to timeout')
    err.name = 'TimeoutError'
    throw err
  })
  assert.equal(await cache.getArtifact('https://acmelaw.com/careers'), null)
})

test('an empty body is a failure, not a successful empty artifact', async () => {
  stubFetch(() => ok(''))
  assert.equal(await cache.getArtifact('https://acmelaw.com/careers'), null)
})

test('a whitespace-only body is a failure too', async () => {
  stubFetch(() => ok('   \n  '))
  assert.equal(await cache.getArtifact('https://acmelaw.com/careers'), null)
})

test('a malformed URL returns null without attempting a fetch', async () => {
  stubFetch(() => ok('<html/>'))
  assert.equal(await cache.getArtifact('not a url'), null)
  assert.equal(calls.length, 0)
})

test('a failed fetch is not cached — the next request tries again', async () => {
  stubFetch(() => ({ ok: false, status: 503, text: async () => '' }))
  assert.equal(await cache.getArtifact('https://acmelaw.com/careers'), null)

  stubFetch(() => ok('<html>back up</html>'))
  const retry = await cache.getArtifact('https://acmelaw.com/careers')
  assert.equal(retry.content, '<html>back up</html>')
})

// ── Firecrawl fallback ───────────────────────────────────────────────────────

test('Firecrawl is not called when a plain fetch succeeds', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch(() => ok('<html>static site</html>'))

  const artifact = await cache.getArtifact('https://acmelaw.com/careers')

  assert.equal(artifact.content, '<html>static site</html>')
  assert.equal(calls.length, 1)
  assert.ok(!calls.some((u) => u.includes('firecrawl')))
})

test('a blocked page falls back to Firecrawl when the key is set', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch((url) => {
    if (url.includes('firecrawl')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { markdown: '# Careers' } }),
      }
    }
    return { ok: false, status: 403, text: async () => 'Forbidden' }
  })

  const artifact = await cache.getArtifact('https://altamimi.com/careers')

  assert.equal(artifact.content, '# Careers')
  assert.equal(calls.length, 2)
  assert.ok(calls[1].includes('api.firecrawl.dev'))
})

test('no Firecrawl key is a supported state — blocked page just returns null', async () => {
  stubFetch(() => ({ ok: false, status: 403, text: async () => 'Forbidden' }))

  assert.equal(await cache.getArtifact('https://altamimi.com/careers'), null)
  assert.equal(calls.length, 1, 'expected no Firecrawl attempt without a key')
})

test('a Firecrawl failure returns null rather than throwing', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch((url) => {
    if (url.includes('firecrawl')) throw new Error('firecrawl down')
    return { ok: false, status: 403, text: async () => 'Forbidden' }
  })

  assert.equal(await cache.getArtifact('https://altamimi.com/careers'), null)
})

test('a Firecrawl response with no markdown is a failure, not an empty success', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch((url) => {
    if (url.includes('firecrawl')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { markdown: '' } }),
      }
    }
    return { ok: false, status: 403, text: async () => '' }
  })

  assert.equal(await cache.getArtifact('https://altamimi.com/careers'), null)
})

// ── sourceUrl / fact ─────────────────────────────────────────────────────────
// R1's headline rule: a fact without a verifiable source cannot exist. The
// compiler stops an omitted or hand-written sourceUrl (a raw string is not
// assignable to the branded SourceUrl); these cover the runtime half, which is
// what stops a blank or junk URL arriving from an API response at runtime.

test('sourceUrl accepts a real http(s) URL', () => {
  assert.equal(
    types.sourceUrl('https://acmelaw.com/careers'),
    'https://acmelaw.com/careers',
  )
  assert.equal(types.sourceUrl('http://acmelaw.com/'), 'http://acmelaw.com/')
})

test('sourceUrl rejects the shapes a fabricated source arrives as', () => {
  for (const bad of ['', '   ', null, undefined, 'unknown', 'acmelaw.com']) {
    assert.equal(types.sourceUrl(bad), null, `expected null for ${bad}`)
  }
})

test('fact() returns null when provenance has no source', () => {
  assert.equal(
    types.fact('12 paralegals', {
      sourceUrl: types.sourceUrl(''),
      sourceType: 'site',
      retrievedAt: new Date().toISOString(),
      confidence: 'high',
    }),
    null,
    'a fact with no source must not be constructible',
  )
})

test('fact() carries provenance through intact', () => {
  const retrievedAt = '2026-03-03T00:00:00.000Z'
  const built = types.fact(3, {
    sourceUrl: types.sourceUrl('https://acmelaw.com/careers'),
    sourceType: 'ats',
    retrievedAt,
    confidence: 'high',
    excerpt: 'chasing outstanding client documents',
  })

  assert.equal(built.value, 3)
  assert.equal(built.provenance.sourceUrl, 'https://acmelaw.com/careers')
  assert.equal(built.provenance.sourceType, 'ats')
  assert.equal(built.provenance.retrievedAt, retrievedAt)
  assert.equal(built.provenance.confidence, 'high')
  assert.equal(built.provenance.excerpt, 'chasing outstanding client documents')
})

test('excerpt is capped at 200 chars and stays a verbatim prefix', () => {
  const long = 'x'.repeat(500)
  const built = types.fact('v', {
    sourceUrl: types.sourceUrl('https://acmelaw.com/careers'),
    sourceType: 'ats',
    retrievedAt: new Date().toISOString(),
    confidence: 'medium',
    excerpt: long,
  })

  assert.equal(types.EXCERPT_MAX, 200)
  assert.equal(built.provenance.excerpt.length, 200)
  assert.ok(long.startsWith(built.provenance.excerpt))
})

test('an absent excerpt stays absent rather than becoming an empty string', () => {
  const built = types.fact('v', {
    sourceUrl: types.sourceUrl('https://acmelaw.com/careers'),
    sourceType: 'site',
    retrievedAt: new Date().toISOString(),
    confidence: 'low',
  })
  assert.ok(!('excerpt' in built.provenance))
})

// ── Firecrawl budget ─────────────────────────────────────────────────────────
// Free tier: 1,000 credits a month, 10 scrapes a minute, shared across every
// Profit Map the app runs. Overrunning either is not an error condition to
// recover from — it is a gap in coverage, and it has to be visible as one.

test('the per-minute cap is enforced before the request, not after a 429', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  let scrapes = 0
  stubFetch((url) => {
    if (url.includes('firecrawl')) {
      scrapes += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { markdown: '# ok' } }),
      }
    }
    return { ok: false, status: 403, text: async () => 'Forbidden' }
  })

  /* 12 blocked pages, but the free tier allows 10 scrapes a minute. */
  for (let i = 0; i < 12; i += 1) {
    await cache.getArtifact(`https://blocked.example/page-${i}`)
  }

  assert.equal(scrapes, 10, 'must stop at the documented per-minute limit')
  assert.equal(cache.firecrawlBudget().available, false)
  assert.match(cache.firecrawlBudget().reason, /rate limit/)
})

test('the window rolls, so the cap is per-minute and not per-process', async (t) => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  let scrapes = 0
  stubFetch((url) => {
    if (url.includes('firecrawl')) {
      scrapes += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { markdown: '# ok' } }),
      }
    }
    return { ok: false, status: 403, text: async () => 'Forbidden' }
  })

  for (let i = 0; i < 10; i += 1) {
    await cache.getArtifact(`https://blocked.example/a-${i}`)
  }
  assert.equal(cache.firecrawlBudget().available, false)

  const realNow = Date.now
  t.after(() => {
    Date.now = realNow
  })
  const jumped = realNow() + 61_000
  Date.now = () => jumped

  assert.equal(cache.firecrawlBudget().available, true, 'the window must roll')
  await cache.getArtifact('https://blocked.example/b-1')
  assert.equal(scrapes, 11)
})

test('402 parks the tier — out of credits is billing state, not a blip', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  let scrapes = 0
  stubFetch((url) => {
    if (url.includes('firecrawl')) {
      scrapes += 1
      return { ok: false, status: 402, json: async () => ({}) }
    }
    return { ok: false, status: 403, text: async () => 'Forbidden' }
  })

  assert.equal(await cache.getArtifact('https://blocked.example/one'), null)
  assert.equal(await cache.getArtifact('https://blocked.example/two'), null)
  assert.equal(await cache.getArtifact('https://blocked.example/three'), null)

  assert.equal(scrapes, 1, 'must not keep paying latency for a guaranteed 402')
  assert.equal(cache.firecrawlBudget().available, false)
  assert.match(cache.firecrawlBudget().reason, /out of credits/)
})

test('429 parks the tier for Retry-After rather than sleeping mid-run', async (t) => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  let scrapes = 0
  stubFetch((url) => {
    if (url.includes('firecrawl')) {
      scrapes += 1
      return {
        ok: false,
        status: 429,
        headers: {
          get: (h) => (h.toLowerCase() === 'retry-after' ? '30' : null),
        },
        json: async () => ({}),
      }
    }
    return { ok: false, status: 403, text: async () => 'Forbidden' }
  })

  assert.equal(await cache.getArtifact('https://blocked.example/one'), null)
  assert.equal(await cache.getArtifact('https://blocked.example/two'), null)
  assert.equal(scrapes, 1)
  assert.match(cache.firecrawlBudget().reason, /rate limited/)

  /* A scout must never block for 30s to fill one row, so the wait is a park,
     not a sleep — the run continues and the tier comes back on its own. */
  const realNow = Date.now
  t.after(() => {
    Date.now = realNow
  })
  const jumped = realNow() + 31_000
  Date.now = () => jumped

  assert.equal(cache.firecrawlBudget().available, true)
})

test('a parked Firecrawl never stops a plain fetch from succeeding', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch((url) => {
    if (url.includes('firecrawl'))
      return { ok: false, status: 402, json: async () => ({}) }
    if (url.includes('blocked'))
      return { ok: false, status: 403, text: async () => '' }
    return ok('<html>fine</html>')
  })

  await cache.getArtifact('https://blocked.example/x')
  assert.equal(cache.firecrawlBudget().available, false)

  const artifact = await cache.getArtifact('https://static.example/careers')
  assert.equal(artifact.content, '<html>fine</html>')
})

test('budget state is inspectable, so a thin run can be explained', async () => {
  /* "We found little" and "we ran out of credits" are different findings, and
     the coverage test has to be able to tell them apart. */
  const fresh = cache.firecrawlBudget()
  assert.equal(fresh.available, true)
  assert.equal(fresh.reason, null)
  assert.equal(fresh.callsInWindow, 0)
})

// ── 404 is an answer, not a refusal ──────────────────────────────────────────

test('a clean 404 does not spend a Firecrawl credit', async () => {
  /* S2 probes five candidate careers paths per company and most legitimately
     404. Escalating those pays a credit, and 15s of wall time, to be told
     again that the page does not exist. */
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch(() => ({ ok: false, status: 404, text: async () => 'Not Found' }))

  assert.equal(await cache.getArtifact('https://acmelaw.com/vacancies'), null)
  assert.equal(calls.length, 1)
  assert.ok(!calls.some((u) => u.includes('firecrawl')))
  assert.equal(cache.firecrawlBudget().callsInWindow, 0)
})

test('410 Gone is also an answer', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch(() => ({ ok: false, status: 410, text: async () => 'Gone' }))

  assert.equal(await cache.getArtifact('https://acmelaw.com/jobs'), null)
  assert.ok(!calls.some((u) => u.includes('firecrawl')))
})

test('a refusal still escalates', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  for (const status of [401, 403, 429, 500, 503]) {
    cache.clearArtifactCache()
    cache.resetFirecrawlBudget()
    stubFetch((url) => {
      if (url.includes('firecrawl')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: { markdown: '# Careers' } }),
        }
      }
      return { ok: false, status, text: async () => '' }
    })

    const artifact = await cache.getArtifact('https://blocked.example/careers')
    assert.equal(
      artifact?.content,
      '# Careers',
      `status ${status} must escalate`,
    )
  }
})

test('a 200 with an empty body escalates — that is a JS shell', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch((url) => {
    if (url.includes('firecrawl')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { markdown: '# Careers' } }),
      }
    }
    return { ok: true, status: 200, text: async () => '   ' }
  })

  const artifact = await cache.getArtifact('https://spa.example/careers')
  assert.equal(artifact.content, '# Careers')
})

test('a network error escalates — the page may be fine and we were not', async () => {
  process.env.FIRECRAWL_API_KEY = 'fc-test'
  stubFetch((url) => {
    if (url.includes('firecrawl')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { markdown: '# Careers' } }),
      }
    }
    throw new Error('ETIMEDOUT')
  })

  const artifact = await cache.getArtifact('https://slow.example/careers')
  assert.equal(artifact.content, '# Careers')
})
