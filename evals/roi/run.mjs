import fs from 'fs'
import path from 'path'

import { loadCase, loadJson, scoreReport } from './scoreReport.mjs'

const evalRoot = path.resolve(process.cwd(), 'evals/roi')
const casesRoot = path.join(evalRoot, 'cases')
const rubricPath = path.join(evalRoot, 'rubric.json')

function formatScore(label, result) {
  return `${label}: ${result.totalScore}/100`
}

function printBreakdown(result) {
  Object.entries(result.breakdown).forEach(([category, details]) => {
    console.log(`    - ${category}: ${details.score}`)
  })
}

function parseArgs(argv) {
  const args = { caseId: null }

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--case') {
      args.caseId = argv[index + 1] ?? null
      index += 1
    }
  }

  return args
}

function getCaseDirectories(root, caseId) {
  const entries = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  if (!caseId) return entries
  return entries.filter((entry) => entry === caseId)
}

async function main() {
  const { caseId } = parseArgs(process.argv.slice(2))
  const rubric = loadJson(rubricPath)
  const caseDirs = getCaseDirectories(casesRoot, caseId)
  const totalCases = caseDirs.length

  if (totalCases === 0) {
    console.error('No ROI eval cases found for the selected filter.')
    process.exitCode = 1
    return
  }

  console.log(`ROI eval run | cases: ${totalCases}`)

  for (const dirName of caseDirs) {
    const caseDir = path.join(casesRoot, dirName)
    const { testCase, reference, actual } = loadCase(caseDir)
    const referenceScore = scoreReport({ text: reference, rubric, testCase })

    console.log(`\n[${testCase.id}] ${testCase.title}`)
    console.log(`  ${formatScore('reference', referenceScore)}`)
    printBreakdown(referenceScore)

    if (actual) {
      const actualScore = scoreReport({ text: actual, rubric, testCase })
      const delta = actualScore.totalScore - referenceScore.totalScore
      console.log(
        `  ${formatScore(
          'actual',
          actualScore,
        )} | delta vs reference: ${delta}`,
      )
      printBreakdown(actualScore)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
