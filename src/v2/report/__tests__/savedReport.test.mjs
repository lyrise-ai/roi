// ─────────────────────────────────────────────────────────────────────────────
// Tests for src/v2/report/savedReport.ts
//
// Verifies:
//   - Save then load gives back the saved inputs, never the claim token
//   - A known id can't overwrite a report
//   - Claiming needs the token and an unowned row
//   - Missing, unknown and unreadable ids each get their own status
// ─────────────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, beforeEach, before, test } from 'node:test'
import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

let saveReport
let loadReport
let claimReport
let tmpDir

const db = {
  rows: new Map(),
  failReads: false,
  failWrites: false,
}

before(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-test-project.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-for-test'

  const cacheRoot = path.resolve(repoRoot, 'node_modules/.cache')
  fs.mkdirSync(cacheRoot, { recursive: true })
  tmpDir = fs.mkdtempSync(path.join(cacheRoot, 'saved-report-test-'))

  const stub = path.join(tmpDir, 'supabase-stub.mjs')
  // A tiny fake of the supabase-js query chain: filters collect, then the
  // last call runs against globalThis.__db.rows.
  fs.writeFileSync(
    stub,
    `export function createClient() {
       const db = () => globalThis.__db
       const pick = (row, cols) =>
         Object.fromEntries(cols.split(',').map((c) => [c.trim(), row[c.trim()]]))
       function query() {
         const q = { filters: [], op: 'select', cols: '*' }
         const matches = (row) => q.filters.every(([c, v]) => (row[c] ?? null) === v)
         const run = () => {
           if (q.op === 'insert') {
             if (db().failWrites) return { data: null, error: { message: 'db down' } }
             if (db().rows.has(q.row.id)) return { data: null, error: { message: 'duplicate key' } }
             const row = { ...JSON.parse(JSON.stringify(q.row)), claim_token: '11111111-1111-4111-8111-111111111111' }
             db().rows.set(row.id, row)
             return { data: pick(row, q.cols), error: null }
           }
           if (q.op === 'update') {
             if (db().failWrites) return { data: null, error: { message: 'db down' } }
             const hit = [...db().rows.values()].filter(matches)
             hit.forEach((row) => Object.assign(row, q.updates))
             return { data: hit.map((r) => pick(r, q.cols)), error: null }
           }
           if (db().failReads) return { data: null, error: { message: 'connection refused' } }
           const row = [...db().rows.values()].find(matches)
           return { data: row ? pick(row, q.cols) : null, error: null }
         }
         const chain = {
           select(cols) { q.cols = cols; return chain },
           insert(row) { q.op = 'insert'; q.row = row; return chain },
           update(updates) { q.op = 'update'; q.updates = updates; return chain },
           eq(c, v) { q.filters.push([c, v]); return chain },
           is(c, v) { q.filters.push([c, v]); return chain },
           async single() { return run() },
           async maybeSingle() { return run() },
           then(resolve) { resolve(run()) },
         }
         return chain
       }
       return { from(table) {
         if (table !== 'v2_reports') throw new Error('unexpected table: ' + table)
         return query()
       } }
     }\n`,
  )

  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { saveReport, loadReport, claimReport } from ${JSON.stringify(
      path.join(here, '../savedReport.ts'),
    )}\n`,
  )

  const outfile = path.join(tmpDir, 'bundle.mjs')
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    alias: {
      '@supabase/supabase-js': stub,
      '@': repoRoot,
    },
    outfile,
    logLevel: 'silent',
  })

  globalThis.__db = db
  ;({ saveReport, loadReport, claimReport } = await import(
    pathToFileURL(outfile).href
  ))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  db.rows.clear()
  db.failReads = false
  db.failWrites = false
})

const ID = '6f1c2b8e-3d4a-4e5f-9a7b-1c2d3e4f5a6b'
const TOKEN = '11111111-1111-4111-8111-111111111111'
const row = (over = {}) => ({
  id: ID,
  company: { name: 'Acme Legal', website: 'acmelegal.com' },
  pains: [{ text: 'Reconciling trust accounts' }],
  research: {},
  words: { observation: 'Four people, 3,000 hours a year.' },
  settings: { currency: 'USD' },
  ...over,
})

test('save then load gives back the saved inputs, not the claim token', async () => {
  assert.equal(await saveReport(row()), TOKEN)
  const loaded = await loadReport(ID)
  assert.deepEqual(loaded, {
    status: 'ok',
    report: {
      id: ID,
      company: row().company,
      pains: row().pains,
      words: row().words,
    },
  })
})

test('a known id cannot overwrite a saved report', async () => {
  await saveReport(row())
  assert.equal(
    await saveReport(row({ words: { observation: 'hijacked' } })),
    null,
  )
  const loaded = await loadReport(ID)
  assert.equal(
    loaded.report.words.observation,
    'Four people, 3,000 hours a year.',
  )
})

test('save refuses a bad id or wrongly shaped fields, and never throws', async () => {
  assert.equal(await saveReport(null), null)
  assert.equal(await saveReport(row({ id: 'rep_acme_123' })), null)
  assert.equal(await saveReport(row({ pains: 'not a list' })), null)
  db.failWrites = true
  assert.equal(await saveReport(row()), null)
})

test('claiming needs the token and an unowned report', async () => {
  await saveReport(row())
  assert.equal(
    await claimReport(ID, 'user-a', '22222222-2222-4222-8222-222222222222'),
    false,
  )
  assert.equal(await claimReport(ID, 'user-a', TOKEN), true)
  assert.equal(db.rows.get(ID).owner_id, 'user-a')
  assert.equal(await claimReport(ID, 'user-b', TOKEN), false)
  assert.equal(db.rows.get(ID).owner_id, 'user-a')
})

test('claiming an id that does not exist is false', async () => {
  assert.equal(await claimReport(ID, 'user-a', TOKEN), false)
})

test('missing, unknown and unreadable ids each get their own status', async () => {
  assert.deepEqual(await loadReport(), { status: 'missing' })
  assert.deepEqual(await loadReport('  '), { status: 'missing' })
  assert.deepEqual(await loadReport('not-a-uuid'), { status: 'not-found' })
  assert.deepEqual(await loadReport(ID), { status: 'not-found' })
  db.failReads = true
  assert.deepEqual(await loadReport(ID), { status: 'unreadable' })
})
