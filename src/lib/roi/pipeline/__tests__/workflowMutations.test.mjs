// Tests for findWorkflowIndex's fuzzy fallback (added alongside LYR-146) —
// exact match always wins; a substring/prefix match is only trusted when it
// resolves to exactly one workflow, so an ambiguous partial name never
// silently edits the wrong workflow.
//
// No test-runner dependency: uses Node's built-in `node:test` + `node:assert`.
// The TypeScript source (with `@/` path aliases) is bundled on the fly by
// esbuild into a temp ESM module, which we then import.
//
//   Run:  node --test src/lib/roi/pipeline/__tests__/workflowMutations.test.mjs
//
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { after, before, test } from 'node:test'

import * as esbuild from 'esbuild'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../../..')

let findWorkflowIndex
let tmpDir

before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-mutations-test-'))
  const outfile = path.join(tmpDir, 'workflowMutations.mjs')
  await esbuild.build({
    entryPoints: [path.join(here, '../workflowMutations.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile,
    alias: { '@': repoRoot },
    logLevel: 'silent',
  })
  ;({ findWorkflowIndex } = await import(pathToFileURL(outfile).href))
})

after(() => {
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true })
})

function wf(name) {
  return { name }
}

test('exact match (case-insensitive) wins even when a fuzzier match also exists', () => {
  const workflows = [wf('Proposal Drafting'), wf('Proposal Drafting Review')]
  assert.equal(findWorkflowIndex(workflows, 'proposal drafting'), 0)
})

test('an unambiguous substring match resolves to the single containing workflow', () => {
  const workflows = [wf('Proposal Drafting and Tailoring'), wf('Invoicing')]
  assert.equal(findWorkflowIndex(workflows, 'Proposal Drafting'), 0)
})

test('an ambiguous substring match (matches more than one workflow) is refused, not guessed', () => {
  const workflows = [wf('Client Onboarding'), wf('Vendor Onboarding')]
  assert.equal(findWorkflowIndex(workflows, 'Onboarding'), -1)
})

test('no match at all returns -1', () => {
  const workflows = [wf('Lead Qualification')]
  assert.equal(findWorkflowIndex(workflows, 'Invoicing'), -1)
})
