// ─────────────────────────────────────────────────────────────────────────────
// Tests for src/lib/roi/v2/savedReport.ts
//
// Verifies:
//   - Save then load gives back the report with { status: 'ok', model }
//   - Missing id returns { status: 'missing' }
//   - Non-existent id returns { status: 'not-found' }
//   - Read failure returns { status: 'unreadable' }
//   - Failed save returns false, never throws
// ─────────────────────────────────────────────────────────────────────────────

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, beforeEach, before, test } from 'node:test'
import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../../..')

let saveReport
let loadReport
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
  fs.writeFileSync(
    stub,
    `export function createClient() {
       return {
         from(table) {
           if (table !== 'v2_reports') throw new Error('unexpected table: ' + table)
           return {
             select() {
               return {
                 eq(_col, id) {
                   return {
                     async maybeSingle() {
                       if (globalThis.__db.failReads) {
                         return { data: null, error: { message: 'connection refused' } }
                       }
                       const row = globalThis.__db.rows.get(id)
                       return { data: row ?? null, error: null }
                     },
                   }
                 },
               }
             },
             async upsert(row) {
               if (globalThis.__db.failWrites) {
                 return { error: { message: 'disk full or db down' } }
               }
               globalThis.__db.rows.set(row.id, JSON.parse(JSON.stringify(row)))
               return { error: null }
             },
           }
         },
       }
     }\n`,
  )

  const entry = path.join(tmpDir, 'entry.ts')
  fs.writeFileSync(
    entry,
    `export { saveReport, loadReport, buildReport } from ${JSON.stringify(
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
  ;({ saveReport, loadReport } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
  db.rows.clear()
  db.failReads = false
  db.failWrites = false
})

test('saveReport then loadReport returns the same report', async () => {
  const row = {
    id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    company: { name: 'Acme Test Firm', website: 'acmetest.com' },
    pains: [{ text: 'Manual billing' }],
    research: { findings: [] },
    words: { thesis: 'Start with automated reconciliation.' },
    settings: { currency: 'USD' },
  }

  const saved = await saveReport(row)
  assert.equal(saved, true, 'saveReport should return true')

  const loaded = await loadReport(row.id)
  assert.equal(loaded.status, 'ok')
  assert.ok(loaded.model)
  assert.equal(loaded.model.thesis, 'Start with automated reconciliation.')
})

test('loadReport returns { status: "missing" } when id is empty or omitted', async () => {
  assert.deepEqual(await loadReport(), { status: 'missing' })
  assert.deepEqual(await loadReport(''), { status: 'missing' })
  assert.deepEqual(await loadReport('   '), { status: 'missing' })
  assert.deepEqual(await loadReport(null), { status: 'missing' })
})

test('loadReport returns { status: "not-found" } when row does not exist', async () => {
  const loaded = await loadReport('00000000-0000-0000-0000-000000000000')
  assert.deepEqual(loaded, { status: 'not-found' })
})

test('loadReport returns { status: "unreadable" } when database query fails', async () => {
  db.failReads = true
  const loaded = await loadReport('any-valid-uuid')
  assert.deepEqual(loaded, { status: 'unreadable' })
})

test('saveReport returns false and never throws when database query fails', async () => {
  db.failWrites = true
  const result = await saveReport({
    id: 'broken-save-uuid',
    company: {},
    pains: [],
    research: {},
    words: {},
    settings: {},
  })
  assert.equal(result, false, 'saveReport must return false on db failure')
})

test('saveReport returns false and never throws when invalid row is provided', async () => {
  assert.equal(await saveReport(null), false)
  assert.equal(await saveReport({}), false)
  assert.equal(await saveReport({ id: '' }), false)
})
