// Tests that the two LYR-146 fixes in roiCalculator.ts stay fixed:
//   1. Which limit a too-high rate comes back to (Rule 6A). It must come back
//      to the stretched limit it actually crossed, not to the plain top of the
//      band — otherwise asking for a HIGHER rate can show up as a lower one.
//   2. The revenue check (Rule 6B) must never run again on later edits.
//      Otherwise every edit gets scaled back to roughly the same total, which
//      is exactly what LYR-146 reported: "workflow edits don't change the
//      total".
//
// No test framework needed: this uses Node's own `node:test` and `node:assert`.
// The TypeScript source uses `@/` path shortcuts, so esbuild bundles it into a
// temporary module first, and we import that.
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
    // For the default region, the mid-level band is 40 to 60, so the stretched
    // limit is 60 x 1.5 = 90.
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
  // Revenue small enough that either rate below produces a total well past the
  // 20% ceiling. That forces the revenue check, when it runs, to scale both
  // down to the same target — which reproduces the exact "my edits don't change
  // the numbers" symptom that happens when the check wrongly runs on every
  // edit.
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
