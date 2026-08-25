// The bundled Chromium unpacks to one file in /tmp, and the function that says
// where it is hands out that path before writing has finished. So two PDFs
// rendering at once meant the second one tried to run a half-written program and
// died. One bulk batch lost all 28 of its emails to this. The only thing worth
// pinning down is that two renders never overlap.
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
