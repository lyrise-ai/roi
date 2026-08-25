// Proves a rewrite touched comments only.
// For every file changed against a git ref, strip comments and whitespace with
// esbuild on both versions and compare. Identifier renaming stays OFF, or the
// check reports false differences. Any difference means real code moved, not
// just words in a comment.
//
//   node only-comments-changed.mjs [ref]        (default: HEAD)
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import * as esbuild from 'esbuild'

const ref = process.argv[2] || 'HEAD'
const loaders = { js: 'jsx', jsx: 'jsx', mjs: 'jsx', ts: 'ts', tsx: 'tsx' }

const changed = execSync(`git diff --name-only ${ref}`, { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && loaders[f.split('.').pop()])

let bad = 0
for (const file of changed) {
  const loader = loaders[file.split('.').pop()]
  const before = execSync(`git show ${ref}:${file}`, { encoding: 'utf8' })
  const after = fs.readFileSync(file, 'utf8')
  const strip = (code) =>
    esbuild.transformSync(code, {
      loader,
      minifyWhitespace: true,
      legalComments: 'none',
    }).code
  try {
    if (strip(before) !== strip(after)) {
      console.log(`CODE CHANGED: ${file}`)
      bad++
    }
  } catch (e) {
    console.log(`PARSE FAIL: ${file} — ${e.message.split('\n')[0]}`)
    bad++
  }
}
console.log(
  bad === 0
    ? `ok — ${changed.length} files, comments only`
    : `${bad} of ${changed.length} files changed code`,
)
process.exit(bad === 0 ? 0 : 1)
