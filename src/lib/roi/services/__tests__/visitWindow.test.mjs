// A first-time visitor was being announced as "Return visit #3", twice over,
// because every HTTP request the browser made counted as its own visit. What
// matters is that bursts collapse and genuine returns still count.
import assert from 'node:assert/strict'
import { test } from 'node:test'

const { visitStarts, VISIT_WINDOW_MS } = await import('../visitWindow.js')

const at = (...offsets) => offsets.map((m) => 1_000_000 + m)

test('one open, however many requests it makes, is one visit', () => {
  // document, hydration data fetch, a prefetch, a refresh
  assert.deepEqual(visitStarts(at(0, 96, 2_300, 60_000)), at(0))
})

test('a genuine return is a second visit', () => {
  // the quiet window runs from the last hit, not the first
  const times = at(0, 96, 96 + VISIT_WINDOW_MS + 1)
  assert.deepEqual(visitStarts(times), at(0, 96 + VISIT_WINDOW_MS + 1))
})

test('a hit exactly on the window edge still belongs to the visit', () => {
  assert.deepEqual(visitStarts(at(0, VISIT_WINDOW_MS)), at(0))
})

test('no history yet', () => {
  assert.deepEqual(visitStarts([]), [])
})
