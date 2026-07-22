// Locks in that buildChangedToNavKeys() (derived from NAV_ITEMS' changedKeys)
// reproduces the map ReportViewer.jsx used to hardcode by hand — the whole
// point of deriving it is that the two can never silently drift apart again.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildChangedToNavKeys } from '../navItems.js'

test('buildChangedToNavKeys matches the original hand-maintained map', () => {
  assert.deepEqual(buildChangedToNavKeys(), {
    financials: ['overview', 'outlook'],
    thesis: ['overview'],
    workflows: ['workflows'],
    profit_levers: ['uplift'],
    cost_of_delay: ['delay'],
    resilience_rows: ['resilience'],
    risks: ['risks'],
    pilot: ['roadmap'],
    cta: ['next'],
  })
})
