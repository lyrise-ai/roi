/* Run the research agent against one company and print what happened.
 *
 *   npm run research -- hlbhamt.com
 *
 * Not a score and not a pass/fail. It is a way to LOOK at a run: what the agent
 * found, what it tried, and what it could not find out. The old coverage harness
 * turned every change into an argument about a number before we could see
 * whether the thing worked at all.
 *
 * It costs real API spend and really fetches pages. One company at a time on
 * purpose.
 *
 * Two firms worth looking at first, both written up by hand in ground-truth.md:
 *
 *   hlbhamt.com    has two live auditor jobs. The old code found neither,
 *                  because its careers pages are /careers-at-hlb-hamt/ and
 *                  /career/ and we only ever tried five fixed addresses.
 *
 *   stalawfirm.com answers, but its apex redirect alone takes 20 seconds and we
 *                  wait 15. The right output here is NOT "nothing found" — it is
 *                  a gap saying their site was too slow to read.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

const domain = process.argv[2]
if (!domain) {
  console.error('Usage: npm run research -- <domain>')
  process.exit(1)
}

/* Bundled rather than imported, because the agent is TypeScript and reaches for
   the `@/` alias. Same trick the other harnesses in this folder use. */
const cacheRoot = path.join(root, 'node_modules/.cache')
fs.mkdirSync(cacheRoot, { recursive: true })
const outfile = path.join(cacheRoot, 'research-look.mjs')

await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/roi/research/agent.ts')],
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  alias: { '@/src/lib/roi/llm': path.join(root, 'src/lib/roi/llm.ts') },
  outfile,
  logLevel: 'silent',
})
const { research } = await import(pathToFileURL(outfile).href)

const startedAt = Date.now()
let firstFindingMs = null

console.log(`\n── ${domain} ──\n`)

const found = await research(domain, {
  onFinding: (finding) => {
    firstFindingMs ??= Date.now() - startedAt
    console.log(`  • ${finding.says}`)
    console.log(`    ${finding.link}`)
    if (finding.quote) console.log(`    "${finding.quote}"`)
    console.log('')
  },
  onStep: (step) => {
    console.log(`  [${step.number}] ${step.using.join(', ')}`)
  },
})

console.log(`\n── what it tried ──`)
for (const attempt of found.tried) {
  const ms = `${String(attempt.ms).padStart(6)}ms`
  console.log(`  ${ms}  ${attempt.got.padEnd(8)} ${attempt.tried}`)
  if (attempt.why) console.log(`            ${attempt.why}`)
}

if (found.handWork.length > 0) {
  console.log(`\n── done by hand ──`)
  for (const item of found.handWork) console.log(`  • ${item}`)
}

/* The half that used to be invisible. A run that found nothing should say why,
   in a sentence a person could be shown. */
console.log(`\n── could not find out ──`)
if (found.gaps.length === 0)
  console.log('  (nothing — it found what it looked for)')
for (const gap of found.gaps) console.log(`  • ${gap}`)

console.log(`\n── summary ──`)
console.log(`  findings     ${found.findings.length}`)
console.log(`  confidence   ${found.confidence}`)
console.log(`  calls made   ${found.tried.length}`)
console.log(
  `  first find   ${firstFindingMs === null ? 'never' : `${firstFindingMs}ms`}`,
)
console.log(`  total        ${Date.now() - startedAt}ms\n`)
