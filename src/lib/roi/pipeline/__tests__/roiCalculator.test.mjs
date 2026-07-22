// Regression tests for the two LYR-146 fixes in roiCalculator.ts:
//   1. Rate-ceiling clamp direction (Rule 6A) — an outlier rate must clamp to
//      the 1.5x "headroom" boundary it actually crossed, not the bare
//      band-top, or a requested rate *increase* can render as a decrease.
//   2. The revenue guardrail (Rule 6B) must never re-run on post-generation
//      edits — otherwise every edit gets rescaled back to ~the same TFG,
//      which is the exact symptom LYR-146 reported ("workflow edits don't
//      recalculate TFG").
//
// No test-runner dependency: uses Node's built-in `node:test` + `node:assert`.
// The TypeScript source (with `@/` path aliases) is bundled on the fly by
// esbuild into a temp ESM module, which we then import.
//
//   Run:  node --test src/lib/roi/pipeline/__tests__/roiCalculator.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, describe, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../../..')

let roiCalculator
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roi-calc-test-'))
  const outfile = path.join(tmpDir, 'roiCalculator.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../roiCalculator.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    alias: { '@': repoRoot },
    logLevel: 'silent',
  })
  ;({ roiCalculator } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

const USD = { code: 'USD', symbol: '$', name: 'US Dollar' }

function baseGlobals(over = {}) {
  return {
    laborRate: 50,
    implementationCost: 28000,
    monthlyToolingCost: 950,
    profitMultiplier: 2,
    realizationFactor: 1,
    workWeeksPerYear: 52,
    currency: USD,
    ...over,
  }
}

function baseCompany(over = {}) {
  return {
    company: 'Acme',
    industry: 'Technology / SaaS',
    country: null, // -> DEFAULT region band
    primaryFocus: 'Sells widgets',
    keyPriorities: [],
    employees: 35,
    revenueEstimateM: null,
    ...over,
  }
}

function baseWorkflow(over = {}) {
  return {
    name: 'Lead qualification',
    agentName: 'Lead Qualification Agent',
    function: 'Revenue Operations',
    owner: 'COO',
    whyItMatters: 'Speed.',
    expectedOutcome: 'Faster routing.',
    sourceType: 'research_derived',
    monthlyVolume: 100,
    minutesPerItemBefore: 60,
    minutesPerItemAfter: 10,
    adoptionRate: 1,
    exceptionRate: 0,
    exceptionMinutes: 0,
    rateOverride: 45,
    seniorityLevel: 'mid',
    rateSource: null,
    rateSourceUrl: null,
    rationale: '',
    ...over,
  }
}

describe('roiCalculator — Rule 6A ceiling clamp (LYR-146)', () => {
  test('an outlier rate above the headroom boundary clamps TO that boundary, not the bare band-top', () => {
    // DEFAULT region, mid tier band is [40, 60] -> headroom ceiling = 60*1.5 = 90.
    const out = roiCalculator(
      [baseWorkflow({ rateOverride: 130 })],
      baseGlobals(),
      baseCompany(),
    )
    const effectiveRate = out.workflows[0].effectiveRate
    assert.equal(
      effectiveRate,
      90,
      'must clamp to the 1.5x headroom ceiling (90), not the bare band-top (60)',
    )
  })

  test('a rate inside the headroom zone (above band-top, below 1.5x) is left untouched', () => {
    const out = roiCalculator(
      [baseWorkflow({ rateOverride: 75 })], // between band-top 60 and headroom 90
      baseGlobals(),
      baseCompany(),
    )
    assert.equal(out.workflows[0].effectiveRate, 75)
  })
})

describe('roiCalculator — revenue guardrail gating (LYR-146)', () => {
  // Revenue small enough that the raw TFG from either rate below blows past
  // the 20% ceiling, forcing the guardrail (when applied) to rescale both
  // down to the same target — reproducing the exact "edits don't move the
  // numbers" symptom when the guardrail wrongly re-runs on every edit.
  const company = baseCompany({ revenueEstimateM: 0.1 }) // $100k revenue
  const globals = baseGlobals()

  test('applyRevenueGuardrail=false (default, edit path): different rates produce different TFG', () => {
    const lowRate = roiCalculator(
      [baseWorkflow({ rateOverride: 45 })],
      globals,
      company,
    )
    const highRate = roiCalculator(
      [baseWorkflow({ rateOverride: 55 })],
      globals,
      company,
    )
    assert.notEqual(
      lowRate.summary.totalFinancialGain12mo,
      highRate.summary.totalFinancialGain12mo,
      'an edit must be visible in TFG when the guardrail is off',
    )
  })

  test('applyRevenueGuardrail=true (generation path): different rates collapse to ~the same TFG', () => {
    const lowRate = roiCalculator(
      [baseWorkflow({ rateOverride: 45 })],
      globals,
      company,
      true,
    )
    const highRate = roiCalculator(
      [baseWorkflow({ rateOverride: 55 })],
      globals,
      company,
      true,
    )
    assert.equal(
      lowRate.summary.totalFinancialGain12mo,
      highRate.summary.totalFinancialGain12mo,
      'the guardrail rescales both to the same revenue-band target',
    )
    // Both must land within the 5-20% band the guardrail targets.
    const revenueU = company.revenueEstimateM * 1e6
    const pct = (lowRate.summary.totalFinancialGain12mo / revenueU) * 100
    assert.ok(pct <= 20, `expected TFG within 20% ceiling, got ${pct}%`)
  })
})
