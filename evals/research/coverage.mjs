// ─────────────────────────────────────────────────────────────────────────────
// R8 — research coverage test (LYR-187 R8 / LYR-201).
//
// A measurement, not a build. It runs the whole research pipeline against real
// professional-services firms and reports what actually came back, because
// every coverage number in the plan up to now has been a guess and vendors
// publish marketing figures. Nobody knows how well any of this works on a
// 30-person law firm in Riyadh until it is run.
//
// Three decisions hang on the output: whether Ever Jobs is worth a container,
// whether TheirStack is worth paying for, and whether GCC coverage is good
// enough to run the product there at all.
//
//   npm run eval:research              all domains
//   npm run eval:research -- --limit 5 first five, for a smoke run
//
// Writes evals/research/results.json next to this file and prints the summary
// that goes onto the Linear card.
//
// This costs real money and real credits: one gpt-4o-mini extraction per
// posting, and a Firecrawl credit per careers page that blocks a plain fetch.
// It is not part of `npm test` for that reason.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

/* Load .env.local the same way `next dev` would. The pipeline degrades without
   keys, but the whole point of this run is to measure it configured. */
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
/* Modest concurrency: enough to finish in minutes, low enough that the
   Firecrawl per-minute cap is never the thing being measured. */
const CONCURRENCY = 3

const cacheRoot = path.join(root, 'node_modules/.cache')
fs.mkdirSync(cacheRoot, { recursive: true })
const outfile = path.join(cacheRoot, 'r8-orchestrator.mjs')
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/roi/research/orchestrator.ts')],
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  alias: { '@/src/lib/roi/llm': path.join(root, 'src/lib/roi/llm.ts') },
  outfile,
  logLevel: 'silent',
})
const { runResearch } = await import(pathToFileURL(outfile).href)

const { domains } = JSON.parse(
  fs.readFileSync(path.join(here, 'domains.json'), 'utf8'),
)
const targets = domains.slice(0, LIMIT)

async function measure(entry) {
  const startedAt = Date.now()
  try {
    const run = await runResearch(entry.domain)
    const s1 = await run.store.get('S1')
    const s2 = await run.store.get('S2')

    const hit = (result, prefix) =>
      (result?.sourcesAttempted ?? []).find(
        (a) => a.outcome === 'hit' && a.source.startsWith(prefix),
      )?.source ?? null

    /* An ATS board that exists but is empty is a 'hit' at the transport level
       and still contributed nothing. Attributing the run to L1 in that case
       overstates ATS coverage — the postings, if any, came from the careers
       page. `notes` is where S2 records an empty board. */
    const emptyBoard = /board found with no open roles/.test(s2?.notes ?? '')
    const atsHit = emptyBoard
      ? null
      : (s2?.sourcesAttempted ?? []).find(
          (a) => a.outcome === 'hit' && !a.source.startsWith('careers'),
        )
    const emptyBoardSource = (s2?.sourcesAttempted ?? []).find(
      (a) => a.outcome === 'hit' && !a.source.startsWith('careers'),
    )
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
        postings: s2?.facts?.postings?.length ?? 0,
        /* Which tier of the cascade actually did the work — question 3. */
        tierUsed: atsHit ? 'L1-ats' : careersHit ? 'L2-careers' : 'none',
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
      manualWork: run.summary.manualWorkIndicators,
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

/* Fixed-size worker pool rather than a chunked barrier, so a slow domain does
   not idle the other two workers behind it. */
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
          `${Math.round((row.durationMs ?? 0) / 100) / 10}s\n`,
      )
    }
  }),
)

fs.writeFileSync(
  path.join(here, 'results.json'),
  `${JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2)}\n`,
)

// ── the four questions ───────────────────────────────────────────────────────

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
for (const tier of ['L1-ats', 'L2-careers', 'none']) {
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
