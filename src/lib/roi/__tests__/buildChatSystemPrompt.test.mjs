// Regression check for the "chat's workflow list wasn't sorted" bug: the
// system prompt used to build its own unsorted merge, so the workflow it
// implicitly treated as "the top one" (first in the WORKFLOWS section, used
// for lever positional fallback) could differ from the sorted order the PDF
// and web report use. Now both go through the same mergeWorkflows().
//
//   Run:  node --test src/lib/roi/__tests__/buildChatSystemPrompt.test.mjs
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

let roiCalculator
let buildChatSystemPrompt
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-prompt-test-'))

  const calcOut = path.join(tmpDir, 'roiCalculator.mjs')
  await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src/lib/roi/pipeline/roiCalculator.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: calcOut,
    alias: { '@': repoRoot },
    logLevel: 'silent',
  })
  ;({ roiCalculator } = await import(pathToFileURL(calcOut).href))

  const agentOut = path.join(tmpDir, 'agent.mjs')
  await esbuild.build({
    entryPoints: [path.join(repoRoot, 'src/lib/roi/agent.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: agentOut,
    alias: { '@': repoRoot },
    logLevel: 'silent',
  })
  ;({ buildChatSystemPrompt } = await import(pathToFileURL(agentOut).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

function wf(name, monthlyVolume, rateOverride) {
  return {
    name,
    agentName: `${name} Agent`,
    function: 'Ops',
    owner: 'COO',
    whyItMatters: 'x',
    expectedOutcome: 'x',
    sourceType: 'inferred',
    monthlyVolume,
    minutesPerItemBefore: 60,
    minutesPerItemAfter: 10,
    adoptionRate: 0.7,
    exceptionRate: 0.05,
    exceptionMinutes: 5,
    rateOverride,
    seniorityLevel: 'mid',
    rateSource: 'benchmark_fallback',
    rateSourceUrl: null,
    rationale: 'x',
  }
}

test('WORKFLOWS section lists the highest-value workflow first, matching PDF/web ordering', () => {
  const globals = {
    laborRate: 50,
    implementationCost: 20000,
    monthlyToolingCost: 500,
    profitMultiplier: 2,
    realizationFactor: 0.8,
    workWeeksPerYear: 50,
    currency: { code: 'USD', symbol: '$', name: 'US Dollar' },
  }
  const company = {
    company: 'Acme',
    industry: 'Tech',
    country: 'United States',
    primaryFocus: null,
    keyPriorities: [],
    employees: 20,
    revenueEstimateM: null,
  }
  // "Small Workflow" is listed FIRST in the input array but has a much lower
  // annual value than "Big Workflow" — a naive unsorted merge would put it
  // first in the prompt too.
  const workflows = [wf('Small Workflow', 10, 50), wf('Big Workflow', 500, 50)]
  const calcOutput = roiCalculator(workflows, globals, company, false)

  const state = {
    normInput: null,
    company,
    globals,
    workflows,
    copy: {
      cta_paragraph: 'cta',
      profit_levers: [],
      unified_pattern_thesis: 'thesis',
      company_snapshot: [],
      cost_of_delay: { narrative: 'n' },
      resilience_rows: [],
      pilot_recommendation: 'p',
      risks: [],
    },
    calcOutput,
    assembled: null,
    renderedHtml: null,
    renderedFullHtml: null,
    confidenceLevel: 'high',
    coreThesis: null,
  }

  const prompt = buildChatSystemPrompt(state)
  const bigIdx = prompt.indexOf('[Big Workflow]')
  const smallIdx = prompt.indexOf('[Small Workflow]')
  assert.ok(
    bigIdx !== -1 && smallIdx !== -1,
    'expected both workflows in prompt',
  )
  assert.ok(
    bigIdx < smallIdx,
    'expected Big Workflow (higher annual value) to appear first',
  )
})
