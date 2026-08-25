// A quick check on formatReportSection, which writes out a report section for
// the chat tool. Not thorough: it catches a thrown error or empty output across
// all 11 sections, and checks the contents of two of them directly — the two
// the "9 invisible fields" gap was about.
//
//   Run:  node --test src/lib/roi/__tests__/formatReportSection.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

let buildState
let formatReportSection
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frs-test-'))

  const fixturesOut = path.join(tmpDir, 'fixtures.mjs')
  await esbuild.build({
    entryPoints: [
      path.join(repoRoot, 'src/lib/roi/pipeline/__tests__/fixtures.ts'),
    ],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: fixturesOut,
    alias: { '@': repoRoot },
    logLevel: 'silent',
  })
  ;({ buildState } = await import(pathToFileURL(fixturesOut).href))

  const agentOut = path.join(tmpDir, 'agent.mjs')
  await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src/lib/roi/agent.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: agentOut,
    alias: { '@': repoRoot },
    logLevel: 'silent',
    // agent.ts pulls in server-only tools we never call here. Replace anything
    // that might read settings or hit the network at import time.
    external: [],
  })
  ;({ formatReportSection } = await import(pathToFileURL(agentOut).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const SECTIONS = [
  'overview',
  'snapshot',
  'workflows',
  'uplift',
  'outlook',
  'delay',
  'resilience',
  'sources',
  'risks',
  'roadmap',
  'next',
]

test('every section formats to non-empty text without throwing', () => {
  const state = buildState()
  for (const section of SECTIONS) {
    const text = formatReportSection(state, section)
    assert.equal(typeof text, 'string')
    assert.ok(
      text.trim().length > 0,
      `section "${section}" produced empty text`,
    )
  }
})

test('outlook section (previously invisible to the chat agent) includes 24/36mo figures', () => {
  const state = buildState()
  const text = formatReportSection(state, 'outlook')
  assert.match(text, /Year 2/)
  assert.match(text, /Year 3/)
})

test('sources section (previously invisible) includes the evidence URL', () => {
  const state = buildState()
  const text = formatReportSection(state, 'sources')
  assert.match(text, /linkedin\.com\/salary/)
})
