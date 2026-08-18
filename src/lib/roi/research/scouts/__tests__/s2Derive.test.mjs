// Unit tests for S2's deterministic core (LYR-187 R3 / LYR-196).
//
// The extraction model reads a posting; everything counted ACROSS postings is
// arithmetic and lives here. An LLM computing "three of their last five" is
// untestable and drifts between runs, which is why these are pure functions
// with fixed inputs.
//
//   Run:  node --test src/lib/roi/research/scouts/__tests__/s2Derive.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let d
let tmpDir

before(async () => {
  const cacheRoot = path.resolve(
    here,
    '../../../../../..',
    'node_modules/.cache',
  )
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 's2-derive-test-'))
  const outfile = path.join(tmpDir, 's2Derive.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../s2Derive.ts')],
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    outfile,
    logLevel: 'silent',
  })
  d = await import(pathToFileURL(outfile).href)
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString()

// ── L0 slug candidates ───────────────────────────────────────────────────────

test('baseLabel finds the registrable label', () => {
  assert.equal(d.baseLabel('acmelaw.com'), 'acmelaw')
  assert.equal(d.baseLabel('www.acmelaw.com'), 'acmelaw')
  assert.equal(d.baseLabel('acmelaw.co.uk'), 'acmelaw')
  assert.equal(d.baseLabel('acmelaw.com.sa'), 'acmelaw')
  assert.equal(d.baseLabel('careers.acmelaw.com'), 'acmelaw')
  assert.equal(d.baseLabel('https://acmelaw.ae/about'), 'acmelaw')
})

test('baseLabel returns null for what is not a domain', () => {
  for (const bad of ['', '   ', 'acmelaw', null, undefined]) {
    assert.equal(d.baseLabel(bad), null, `for ${bad}`)
  }
})

test('slugCandidates generates multiple guesses, most likely first', () => {
  /* Real ATS slugs vary — the same firm might be `acme-law` or `acmelaw` —
     and every wrong guess is one 404 against a free public endpoint. */
  const hyphenated = d.slugCandidates('acme-law.com')
  assert.equal(hyphenated[0], 'acme-law')
  assert.ok(hyphenated.includes('acmelaw'))

  const suffixed = d.slugCandidates('acmelawllp.com')
  assert.equal(suffixed[0], 'acmelawllp')
  assert.ok(suffixed.includes('acmelaw'))
})

test('slugCandidates dedupes and caps the fan-out', () => {
  const plain = d.slugCandidates('acmelaw.com')
  assert.deepEqual(plain, ['acmelaw'])

  for (const domain of [
    'acme-law-group-llp.com',
    'averylongfirmnamehere.co.uk',
  ]) {
    const candidates = d.slugCandidates(domain)
    assert.ok(candidates.length <= 3, `${domain} produced ${candidates.length}`)
    assert.equal(new Set(candidates).size, candidates.length, 'must be deduped')
  }
})

test('slugCandidates is empty for junk rather than guessing', () => {
  assert.deepEqual(d.slugCandidates('not a domain'), [])
  assert.deepEqual(d.slugCandidates(''), [])
})

// ── normalizeRole ────────────────────────────────────────────────────────────

test('normalizeRole collapses the same job advertised differently', () => {
  /* Without this, a firm re-posting one role reads as two different roles and
     the turnover signal disappears entirely. */
  const variants = [
    'Senior Paralegal',
    'Paralegal (Dubai)',
    'Junior Paralegal - Full Time',
    'PARALEGAL',
    'Paralegal [Remote]',
  ]
  const normalized = variants.map(d.normalizeRole)
  assert.deepEqual(new Set(normalized), new Set(['paralegal']))
})

test('normalizeRole keeps genuinely different roles apart', () => {
  assert.notEqual(
    d.normalizeRole('Paralegal'),
    d.normalizeRole('Legal Counsel'),
  )
  assert.notEqual(d.normalizeRole('Bookkeeper'), d.normalizeRole('Tax Manager'))
})

test('normalizeRole survives junk', () => {
  assert.equal(d.normalizeRole(''), '')
  assert.equal(d.normalizeRole(null), '')
})

// ── repeatPostings — the turnover proxy ──────────────────────────────────────

test('a role posted twice in twelve months is a repeat', () => {
  const out = d.repeatPostings([
    { title: 'Paralegal', postedAt: daysAgo(20) },
    { title: 'Senior Paralegal (Dubai)', postedAt: daysAgo(160) },
    { title: 'Marketing Manager', postedAt: daysAgo(30) },
  ])

  assert.equal(out.length, 1)
  assert.equal(out[0].role, 'paralegal')
  assert.equal(out[0].count, 2)
  /* The span, so a reader can say "twice in about five months". */
  assert.ok(out[0].months >= 4 && out[0].months <= 5, `months=${out[0].months}`)
})

test('postings years apart are growth, not churn', () => {
  const out = d.repeatPostings([
    { title: 'Paralegal', postedAt: daysAgo(10) },
    { title: 'Paralegal', postedAt: daysAgo(1100) },
  ])
  assert.deepEqual(out, [])
})

test('a role posted once is never a repeat', () => {
  const out = d.repeatPostings([
    { title: 'Paralegal', postedAt: daysAgo(10) },
    { title: 'Bookkeeper', postedAt: daysAgo(20) },
  ])
  assert.deepEqual(out, [])
})

test('postings with no date cannot manufacture a repeat', () => {
  /* No date means no twelve-month window, so counting them would invent a
     signal the source never supported. */
  const out = d.repeatPostings([{ title: 'Paralegal' }, { title: 'Paralegal' }])
  assert.deepEqual(out, [])
})

test('repeatPostings ranks the worst churn first and survives junk', () => {
  const out = d.repeatPostings([
    { title: 'Paralegal', postedAt: daysAgo(10) },
    { title: 'Paralegal', postedAt: daysAgo(60) },
    { title: 'Bookkeeper', postedAt: daysAgo(10) },
    { title: 'Bookkeeper', postedAt: daysAgo(40) },
    { title: 'Bookkeeper', postedAt: daysAgo(90) },
  ])
  assert.equal(out[0].role, 'bookkeeper')
  assert.equal(out[0].count, 3)
  assert.deepEqual(d.repeatPostings([]), [])
  assert.deepEqual(d.repeatPostings(null), [])
})

// ── functionDistribution ─────────────────────────────────────────────────────

test('functionDistribution buckets titles by function', () => {
  const out = d.functionDistribution([
    { title: 'Paralegal' },
    { title: 'Legal Counsel' },
    { title: 'Bookkeeper' },
    { title: 'Office Administrator' },
    { title: 'Software Engineer' },
  ])

  assert.equal(out.legal, 2)
  assert.equal(out.finance, 1)
  assert.equal(out.admin, 1)
  assert.equal(out.technology, 1)
})

test('an unclassifiable title is other, not forced into a bucket', () => {
  const out = d.functionDistribution([{ title: 'Chief Vibes Officer' }])
  assert.equal(out.other, 1)
  assert.deepEqual(d.functionDistribution([]), {})
})

// ── rankTaskVerbs ────────────────────────────────────────────────────────────

test('rankTaskVerbs ranks by how many postings mention a verb', () => {
  const out = d.rankTaskVerbs([
    { title: 'A', taskVerbs: ['chase', 'reconcile'] },
    { title: 'B', taskVerbs: ['chase', 'collate'] },
    { title: 'C', taskVerbs: ['chase'] },
  ])

  assert.equal(out[0].verb, 'chase')
  assert.equal(out[0].count, 3)
  assert.equal(out.find((v) => v.verb === 'reconcile').count, 1)
})

test('a verb repeated inside one posting counts once', () => {
  /* A JD saying "chase" six times is one posting that cares about chasing,
     not six independent signals. */
  const out = d.rankTaskVerbs([
    { title: 'A', taskVerbs: ['chase', 'chase', 'CHASE', ' chase '] },
  ])
  assert.deepEqual(out, [{ verb: 'chase', count: 1 }])
})

test('rankTaskVerbs is stable between runs', () => {
  /* Ties break alphabetically. An unstable ranking makes two reports for the
     same company disagree for no reason. */
  const postings = [
    { title: 'A', taskVerbs: ['reconcile', 'chase'] },
    { title: 'B', taskVerbs: ['collate', 'chase'] },
  ]
  const first = d.rankTaskVerbs(postings)
  const second = d.rankTaskVerbs([...postings].reverse())
  assert.deepEqual(first, second)
  assert.deepEqual(
    first.map((v) => v.verb),
    ['chase', 'collate', 'reconcile'],
  )
})

test('rankTaskVerbs handles postings with no verbs', () => {
  assert.deepEqual(
    d.rankTaskVerbs([{ title: 'A' }, { title: 'B', taskVerbs: [] }]),
    [],
  )
  assert.deepEqual(d.rankTaskVerbs([]), [])
})

// ── rankNamedSystems ─────────────────────────────────────────────────────────

test('rankNamedSystems merges spellings and keeps the first seen', () => {
  const out = d.rankNamedSystems([
    {
      title: 'A',
      namedSystems: [{ name: '3E', category: 'practice management' }],
    },
    {
      title: 'B',
      namedSystems: [{ name: '3e', category: 'practice management' }],
    },
    { title: 'C', namedSystems: [{ name: 'Xero', category: 'accounting' }] },
  ])

  assert.equal(out[0].name, '3E')
  assert.equal(out[0].count, 2)
  assert.equal(out[1].name, 'Xero')
})

test('rankNamedSystems defaults a missing category rather than dropping the system', () => {
  const out = d.rankNamedSystems([
    { title: 'A', namedSystems: [{ name: 'Elite' }] },
  ])
  assert.equal(out[0].name, 'Elite')
  assert.equal(out[0].category, 'unknown')
})

test('rankNamedSystems ignores nameless entries', () => {
  const out = d.rankNamedSystems([
    {
      title: 'A',
      namedSystems: [{ name: '', category: 'x' }, { category: 'y' }],
    },
  ])
  assert.deepEqual(out, [])
})

// ── filterTaskVerbs — the prompt asks, this enforces ─────────────────────────

test('generic verbs are dropped whatever the model returns', () => {
  /* Across a live run gpt-4o-mini returned "lead", "drive", "build" and
     "partner" for senior roles despite the prompt banning them: a posting with
     no clerical duties still leaves it feeling obliged to fill the array. A
     set difference cannot be talked out of it. */
  assert.deepEqual(
    d.filterTaskVerbs([
      'chase',
      'lead',
      'reconcile',
      'drive',
      'own',
      'collate',
    ]),
    ['chase', 'reconcile', 'collate'],
  )
})

test('a posting of nothing but generic verbs yields an empty list', () => {
  /* The correct answer for most senior and creative roles. An empty list is
     honest; a list of filler gets quoted back to the company as if it meant
     something. */
  assert.deepEqual(
    d.filterTaskVerbs(['lead', 'own', 'drive', 'build', 'partner']),
    [],
  )
})

test('filterTaskVerbs normalises case, whitespace and duplicates', () => {
  assert.deepEqual(d.filterTaskVerbs(['  Chase ', 'CHASE', 'chase']), ['chase'])
})

test('filterTaskVerbs survives junk input', () => {
  assert.deepEqual(d.filterTaskVerbs(null), [])
  assert.deepEqual(d.filterTaskVerbs(undefined), [])
  assert.deepEqual(d.filterTaskVerbs('chase'), [])
  assert.deepEqual(d.filterTaskVerbs([null, 42, '', '   ']), [])
})

test('rankTaskVerbs applies the same filter, so no caller can leak filler', () => {
  const out = d.rankTaskVerbs([
    { title: 'A', taskVerbs: ['chase', 'lead'] },
    { title: 'B', taskVerbs: ['manage', 'support'] },
  ])
  assert.deepEqual(out, [{ verb: 'chase', count: 1 }])
})

test('same-day duplicate postings are vacancies, not churn', () => {
  /* Regression from a live run: bakertilly.com posted "Consultant IT Advisory"
     twice on one day, which counted as a turnover signal. Two seats filled at
     once is not a role grinding people down. */
  const sameDay = d.repeatPostings([
    { title: 'Consultant IT Advisory', postedAt: daysAgo(10) },
    { title: 'Consultant IT Advisory', postedAt: daysAgo(10) },
  ])
  assert.deepEqual(sameDay, [])

  const aFewDaysApart = d.repeatPostings([
    { title: 'Paralegal', postedAt: daysAgo(10) },
    { title: 'Paralegal', postedAt: daysAgo(13) },
  ])
  assert.deepEqual(
    aFewDaysApart,
    [],
    'a batch posted the same week is still one hire',
  )
})

test('a role genuinely re-posted months later is still a repeat', () => {
  const out = d.repeatPostings([
    { title: 'Paralegal', postedAt: daysAgo(20) },
    { title: 'Paralegal', postedAt: daysAgo(150) },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].count, 2)
})
