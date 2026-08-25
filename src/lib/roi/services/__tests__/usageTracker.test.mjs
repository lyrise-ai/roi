// The tracker is how we know what a report costs. On the 5.6 family cached
// input is 10x cheaper than fresh input, and both the analyst and the report
// writer resend a large stable system prompt every call — so a tracker that
// bills cached tokens at the full rate overstates the true cost of a report by
// close to an order of magnitude, on exactly the calls we care about.
//
//   Run:  node --test src/lib/roi/services/__tests__/usageTracker.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))

let UsageTracker

before(async () => {
  const cacheRoot = path.resolve(
    here,
    '../../../../../..',
    'node_modules/.cache',
  )
  fs.mkdirSync(cacheRoot, { recursive: true })
  const tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'usage-test-'))

  // Only `flush()` reaches for these; the pricing math under test does not.
  const stub = path.join(tmpDir, 'stub.mjs')
  fs.writeFileSync(
    stub,
    `export const EVENTS = new Proxy({}, { get: (_, k) => String(k) })
     export const captureServer = async () => {}`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../usageTracker.ts')],
    bundle: true,
    packages: 'external',
    alias: {
      '@/src/lib/analytics': stub,
      '@/src/lib/posthog-server': stub,
    },
    platform: 'node',
    format: 'esm',
    outfile,
  })
  ;({ UsageTracker } = await import(pathToFileURL(outfile).href))
})

function priceOf(opts) {
  const tracker = new UsageTracker({ company: 'Acme', mode: 'generate' })
  tracker.record({ call: 'c', inputTokens: 0, outputTokens: 0, ...opts })
  return tracker.flush()
}

test('a fully uncached call pays the standard input rate', () => {
  // gpt-5.6-terra: $2.00 in / $12.00 out per 1M
  const { totals } = priceOf({
    model: 'gpt-5.6-terra',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  })
  assert.equal(totals.costUsd, 14)
})

test('cached input is billed at the cached rate, not the standard one', () => {
  // 900K of 1M cached: 100K * $2.00/M + 900K * $0.20/M = $0.20 + $0.18
  const { totals } = priceOf({
    model: 'gpt-5.6-terra',
    inputTokens: 1_000_000,
    cachedInputTokens: 900_000,
    outputTokens: 0,
  })
  assert.equal(Number(totals.costUsd.toFixed(4)), 0.38)
  assert.equal(totals.cachedInputTokens, 900_000)
})

test('cached tokens are a subset of input, never an addition to it', () => {
  // A provider reporting cached > input must not produce a negative charge.
  const { totals } = priceOf({
    model: 'gpt-5.6-luna',
    inputTokens: 1_000,
    cachedInputTokens: 5_000,
    outputTokens: 0,
  })
  assert.ok(totals.costUsd > 0)
  assert.equal(Number(totals.costUsd.toFixed(6)), 0.00002)
})

test('mini is priced as mini, not as its own prefix', () => {
  // 'gpt-4o-mini' starts with 'gpt-4o'; exact match has to win.
  const { totals } = priceOf({
    model: 'gpt-4o-mini',
    inputTokens: 1_000_000,
    outputTokens: 0,
  })
  assert.equal(totals.costUsd, 0.15)
})

test('an unpriced model costs zero rather than throwing', () => {
  const { totals } = priceOf({
    model: 'some-model-we-never-listed',
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
  })
  assert.equal(totals.costUsd, 0)
})
