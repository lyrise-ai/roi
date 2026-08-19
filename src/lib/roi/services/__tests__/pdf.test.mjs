// Chromium is inflated to a single /tmp path and executablePath() hands that
// path out before the write completes, so two overlapping renders make the
// second one exec a half-written binary (`spawn ETXTBSY`). One bulk batch lost
// all 28 of its emails to this. What is worth locking in is only that renders
// never overlap.
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { runExclusive } = await import('../pdf.ts')

test('queued work never overlaps', async () => {
  let running = 0
  let maxConcurrent = 0

  const task = () => async () => {
    running += 1
    maxConcurrent = Math.max(maxConcurrent, running)
    await new Promise((resolve) => setTimeout(resolve, 5))
    running -= 1
    return 'ok'
  }

  const results = await Promise.all([
    runExclusive(task()),
    runExclusive(task()),
    runExclusive(task()),
  ])

  assert.equal(maxConcurrent, 1)
  assert.deepEqual(results, ['ok', 'ok', 'ok'])
})

test('a failed render does not wedge the queue', async () => {
  const failed = runExclusive(async () => {
    throw new Error('spawn ETXTBSY')
  })
  await assert.rejects(failed, /ETXTBSY/)
  assert.equal(await runExclusive(async () => 'still works'), 'still works')
})
