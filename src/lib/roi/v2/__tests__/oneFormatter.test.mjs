// format.ts is the only V2 file that turns a number into text (LYR-244).
// run: node --test src/lib/roi/v2/__tests__/oneFormatter.test.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const V2_DIRS = [
  'pages/v2',
  'pages/api/v2',
  'src/lib/roi/v2',
  'src/components/v2',
]
const FORMATTING = /toLocaleString|Intl\.NumberFormat|toFixed/

test('no V2 file formats a number except format.ts', () => {
  const offenders = V2_DIRS.filter((dir) => fs.existsSync(dir))
    .flatMap((dir) =>
      fs.readdirSync(dir, { recursive: true }).map((f) => path.join(dir, f)),
    )
    .filter((f) => /\.(js|jsx|ts|tsx)$/.test(f))
    .filter((f) => !f.includes('__tests__') && !f.endsWith('format.ts'))
    .filter((f) => FORMATTING.test(fs.readFileSync(f, 'utf8')))

  assert.deepEqual(offenders, [], 'use format.ts instead')
})
