// ─────────────────────────────────────────────────────────────────────────────
// R8 — measuring how much the research system actually finds (LYR-187 R8 /
// LYR-201).
//
// This is a measurement, not a feature. It runs the whole research pipeline
// against real professional-services firms and reports what came back. Every
// coverage figure in the plan so far has been a guess, and vendors publish
// marketing numbers. Nobody knows how well any of this works on a 30-person law
// firm in Riyadh until we run it.
//
// Three decisions depend on the output: whether Ever Jobs is worth setting up,
// whether TheirStack is worth paying for, and whether we can cover the Gulf well
// enough to sell there at all.
//
//   npm run eval:research              every domain
//   npm run eval:research -- --limit 5 just the first five, for a quick check
//
// It writes results.json next to this file, and prints the summary that goes on
// the Linear card.
//
// This costs real money and real credits: one cheap model call per job posting,
// one analyst call per scout that adds sources, and one Firecrawl credit per
// careers page that blocks a plain request. That is why it is not part of
// `npm test`.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

/* Load .env.local the same way `next dev` does. The pipeline still runs without
   keys, but the whole point of this measurement is to see it fully set up. */
const envPath = path.join(root, '.env.local')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  }
}

const argLimit = process.argv.indexOf('--limit')
const LIMIT = argLimit > -1 ? Number(process.argv[argLimit + 1]) : Infinity
/* A few at a time: enough to finish in minutes, few enough that Firecrawl's
   per-minute limit is never what we end up measuring. */
const CONCURRENCY = 3

const cacheRoot = path.join(root, 'node_modules/.cache')
fs.mkdirSync(cacheRoot, { recursive: true })

/* One entry file re-exporting both. The analyst is what this harness now exists
   to read, and it does not live inside the part that runs the scouts — that
   part deliberately imports no model code. Bundling them separately would give
   each its own private copy of the fact store and the page cache. */
const entry = path.join(cacheRoot, 'r8-entry.ts')
fs.writeFileSync(
  entry,
  `export { runResearch } from ${JSON.stringify(path.join(root, 'src/lib/roi/research/orchestrator.ts'))}\n` +
    `export { createResearchAnalyst } from ${JSON.stringify(path.join(root, 'src/lib/roi/research/researchAnalyst.ts'))}\n`,
)
const outfile = path.join(cacheRoot, 'r8-orchestrator.mjs')
await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  alias: { '@/src/lib/roi/llm': path.join(root, 'src/lib/roi/llm.ts') },
  outfile,
  logLevel: 'silent',
})
const { runResearch, createResearchAnalyst } = await import(
  pathToFileURL(outfile).href
)

const { domains } = JSON.parse(
  fs.readFileSync(path.join(here, 'domains.json'), 'utf8'),
)
const targets = domains.slice(0, LIMIT)

async function measure(entry) {
  const startedAt = Date.now()
  try {
    /* The analyst runs through the same callback the side panel uses, so what
       this prints is exactly what a prospect would have seen, in the order they
       would have seen it. The time to the first finding is the number our
       "something on screen within about 3 seconds" target is judged on. */
    let firstFindingMs = null
    const analyst = createResearchAnalyst(entry.domain, {
      onFinding: () => {
        firstFindingMs ??= Date.now() - startedAt
      },
    })
    const run = await runResearch(entry.domain, {
      onScoutResolved: analyst.onScoutResolved,
    })
    const assessment = await analyst.settled()
    const s1 = await run.store.get('S1')
    const s2 = await run.store.get('S2')

    const hit = (result, prefix) =>
      (result?.sourcesAttempted ?? []).find(
        (a) => a.outcome === 'hit' && a.source.startsWith(prefix),
      )?.source ?? null

    /* A hiring board that exists but is empty counts as a successful request and
       still gave us nothing. Crediting the run to the hiring-platform step in
       that case overstates how well those platforms cover us — any postings we
       got came from the careers page instead. */
    const emptyBoard = /board found with no open roles/.test(s2?.notes ?? '')
    /* Search is the finding-by-search step, not a hiring platform. Counting it
       as one overstated direct hiring-platform coverage in this harness's first
       run. */
    /* A job page we followed FROM a list we found by searching belongs to the
       search step. Counting it as a hiring platform overstated direct coverage
       — the same mistake empty Workable boards caused earlier. */
    const isAts = (a) =>
      a.outcome === 'hit' &&
      !a.source.startsWith('careers') &&
      !a.source.startsWith('search') &&
      a.source !== 'job-detail'
    const searchHit = (s2?.sourcesAttempted ?? []).find(
      (a) =>
        a.outcome === 'hit' &&
        (a.source.startsWith('search:') || a.source === 'job-detail'),
    )
    const atsHit = emptyBoard ? null : (s2?.sourcesAttempted ?? []).find(isAts)
    const emptyBoardSource = (s2?.sourcesAttempted ?? []).find(isAts)
    const careersHit = hit(s2, 'careers')

    return {
      ...entry,
      ok: true,
      tier: run.summary.confidenceTier,
      score: run.summary.coverageScore,
      durationMs: run.durationMs,
      s1: {
        status: s1?.status ?? null,
        country: s1?.facts?.country?.value ?? null,
        region: s1?.facts?.region?.value ?? null,
        vertical: s1?.facts?.vertical?.value ?? null,
        sizeBand: s1?.facts?.sizeBand?.value ?? null,
        wonBy:
          (s1?.sourcesAttempted ?? []).find((a) => a.outcome === 'hit')
            ?.source ?? null,
      },
      s2: {
        status: s2?.status ?? null,
        /* Real, dated jobs only. A careers page we could read but not split
           into individual jobs is one web page, not one job, and counting it
           here is how this measurement starts overstating what we know. */
        postings: (s2?.facts?.postings ?? []).filter(
          (p) => (p?.kind ?? 'posting') !== 'page',
        ).length,
        pagesOnly: (s2?.facts?.postings ?? []).filter((p) => p?.kind === 'page')
          .length,
        /* Which tier of the cascade actually did the work — question 3. */
        tierUsed: atsHit
          ? 'L1-ats'
          : searchHit
            ? 'L1.5-search'
            : careersHit
              ? 'L2-careers'
              : 'none',
        platform: atsHit ? atsHit.source.split(':')[0] : null,
        emptyBoardOn:
          emptyBoard && emptyBoardSource
            ? emptyBoardSource.source.split(':')[0]
            : null,
        careersPath: careersHit ? careersHit.replace('careers', '') : null,
        topVerbs: (s2?.facts?.topTaskVerbs ?? [])
          .slice(0, 5)
          .map((f) => f.value),
        systems: (s2?.facts?.namedSystems ?? [])
          .slice(0, 5)
          .map((f) => f.value.name),
        repeats: s2?.facts?.repeatPostings ?? [],
        notes: s2?.notes ?? null,
      },
      /* The old field here came from the verb list, which was deleted in
         LYR-216. What replaced it cannot be scored automatically. The check is a
         person reading these findings for 5 to 10 firms and asking, of each one:
         is it true, is it specific to this company, and would a prospect care. */
      analyst: {
        tier: assessment.confidenceTier,
        firstFindingMs,
        findings: assessment.findings,
        manualWorkSignals: assessment.manualWorkSignals,
        reasoning: assessment.reasoning,
        gaps: assessment.gaps,
      },
      gaps: run.summary.gaps,
    }
  } catch (error) {
    return {
      ...entry,
      ok: false,
      error: error?.message ?? String(error),
      durationMs: Date.now() - startedAt,
    }
  }
}

/* A fixed number of workers pulling from one queue, rather than processing in
   batches. That way one slow domain does not leave the other two workers idle
   waiting for it. */
const results = []
let cursor = 0
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, targets.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= targets.length) return
      const entry = targets[index]
      const row = await measure(entry)
      results[index] = row
      process.stdout.write(
        `${String(index + 1).padStart(2)}/${targets.length} ` +
          `${entry.segment.padEnd(7)} ${entry.domain.padEnd(28)} ` +
          `${(row.tier ?? 'FAIL').padEnd(8)} ` +
          `S1=${(row.s1?.status ?? '-').padEnd(7)} ` +
          `S2=${(row.s2?.status ?? '-').padEnd(7)} ` +
          `posts=${String(row.s2?.postings ?? 0).padStart(3)} ` +
          `via=${(row.s2?.tierUsed ?? '-').padEnd(11)} ` +
          `find=${String(row.analyst?.findings?.length ?? 0).padStart(2)} ` +
          `${Math.round((row.durationMs ?? 0) / 100) / 10}s\n`,
      )
    }
  }),
)

fs.writeFileSync(
  path.join(here, 'results.json'),
  `${JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2)}\n`,
)

// -- the four questions this whole run exists to answer ----------------------

const icp = results.filter((r) => r.segment !== 'control')
const pct = (n, d) => (d === 0 ? '—' : `${Math.round((n / d) * 100)}%`)
const tierCount = (rows, tier) => rows.filter((r) => r.tier === tier).length

function segmentRow(label, rows) {
  if (rows.length === 0) return
  console.log(
    `${label.padEnd(22)} n=${String(rows.length).padStart(2)}  ` +
      `RICH ${pct(tierCount(rows, 'RICH'), rows.length).padStart(4)}  ` +
      `MODERATE ${pct(tierCount(rows, 'MODERATE'), rows.length).padStart(4)}  ` +
      `THIN ${pct(tierCount(rows, 'THIN'), rows.length).padStart(4)}`,
  )
}

console.log('\n══ confidence tier by segment ══')
segmentRow('ICP (all)', icp)
segmentRow(
  '  GCC',
  icp.filter((r) => r.segment === 'GCC'),
)
segmentRow(
  '  UK',
  icp.filter((r) => r.segment === 'UK'),
)
segmentRow(
  '  US',
  icp.filter((r) => r.segment === 'US'),
)
segmentRow(
  'control (non-ICP)',
  results.filter((r) => r.segment === 'control'),
)

console.log('\n══ Q3 — which S2 tier does the work ══')
for (const tier of ['L1-ats', 'L1.5-search', 'L2-careers', 'none']) {
  const rows = icp.filter((r) => r.s2?.tierUsed === tier)
  console.log(
    `${tier.padEnd(12)} ${String(rows.length).padStart(2)}/${icp.length}  ${pct(rows.length, icp.length)}`,
  )
}
const platforms = {}
for (const r of results) {
  if (r.s2?.platform)
    platforms[r.s2.platform] = (platforms[r.s2.platform] ?? 0) + 1
}
console.log(
  'ATS platforms that hit:',
  Object.keys(platforms).length ? platforms : '(none)',
)

console.log('\n══ Q4 — appropriate emptiness ══')
const none = results.filter((r) => r.s2?.status === 'NONE')
const fabricated = none.filter((r) => (r.s2?.postings ?? 0) > 0)
console.log(`S2 NONE: ${none.length}/${results.length}`)
console.log(`NONE but carrying postings (must be 0): ${fabricated.length}`)
console.log(
  `S2 ERROR: ${results.filter((r) => r.s2?.status === 'ERROR').length}`,
)

console.log('\n══ S1 field resolution (ICP) ══')
for (const field of ['country', 'region', 'vertical', 'sizeBand']) {
  const got = icp.filter((r) => r.s1?.[field]).length
  console.log(
    `${field.padEnd(9)} ${String(got).padStart(2)}/${icp.length}  ${pct(got, icp.length)}`,
  )
}

console.log('\n══ latency ══')
const times = results.map((r) => r.durationMs ?? 0).sort((a, b) => a - b)
const at = (q) => times[Math.floor(times.length * q)] ?? 0
console.log(
  `p50 ${Math.round(at(0.5) / 100) / 10}s   p90 ${Math.round(at(0.9) / 100) / 10}s   max ${Math.round(times[times.length - 1] / 100) / 10}s`,
)

const withVerbs = icp.filter((r) => (r.s2?.topVerbs ?? []).length > 0)
console.log(
  `\nICP firms yielding any task verbs: ${withVerbs.length}/${icp.length} (${pct(withVerbs.length, icp.length)})`,
)
const withManual = icp.filter((r) => (r.manualWork ?? []).length > 0)
console.log(
  `ICP firms yielding MANUAL-work verbs: ${withManual.length}/${icp.length} (${pct(withManual.length, icp.length)})`,
)
console.log(`\nresults written to evals/research/results.json`)
