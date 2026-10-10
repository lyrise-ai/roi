import fs from 'fs'
import path from 'path'

const REPORT_DEFAULT_SECTIONS = [
  'Executive Summary',
  'Disclaimer',
  'Company Snapshot',
  'As-Is Baseline',
  'Before AI vs. After AI',
  'Profit Uplift',
  'Total Financial Case',
  'Cost of Delay',
  'Resilience Positioning',
  "What We'd Deploy",
  'Data Provenance',
  'Risks & Mitigations',
  'Roadmap',
  'Next Steps',
]

const EXEC_SUMMARY_DEFAULT_SECTIONS = [
  'Bottom Line Up Front',
  'Confidence & Revenue Context',
  'The Pattern Underneath',
  'Before vs. After AI',
  'Cost of Delay',
  'What Happens Next',
]

function getDefaultSections(documentType) {
  return documentType === 'executive-summary'
    ? EXEC_SUMMARY_DEFAULT_SECTIONS
    : REPORT_DEFAULT_SECTIONS
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value))
}

function normalize(text) {
  return text.toLowerCase()
}

function includesNormalized(text, needle) {
  return normalize(text).includes(normalize(needle))
}

function uniqueHits(text, values = []) {
  const hits = values.filter((value) => includesNormalized(text, value))
  return [...new Set(hits.map((value) => value.toLowerCase()))]
}

function ratioScore(hitCount, totalCount) {
  if (!totalCount) return 100
  return Math.round((hitCount / totalCount) * 100)
}

function weightedTotal(breakdown, weights) {
  const totalWeight = Object.values(weights).reduce(
    (sum, value) => sum + value,
    0,
  )

  if (!totalWeight) return 0

  const weightedScore = Object.entries(weights).reduce((sum, [key, weight]) => {
    const categoryScore = breakdown[key]?.score ?? 0
    return sum + categoryScore * weight
  }, 0)

  return Math.round(weightedScore / totalWeight)
}

export function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function scoreReport({ text, rubric, testCase }) {
  const defaultSections = getDefaultSections(testCase.documentType)
  const headings = [
    ...new Set([
      ...(testCase.documentType === 'executive-summary'
        ? []
        : (rubric.requiredSectionHeadings ?? [])),
      ...defaultSections,
      ...(testCase.requiredSections ?? []),
    ]),
  ]

  const structureHits = uniqueHits(text, headings)
  const forbiddenHits = uniqueHits(text, rubric.forbiddenTerms ?? [])
  const discouragedHits = uniqueHits(text, rubric.discouragedTerms ?? [])
  const companyHits = uniqueHits(text, [testCase.companyName])
  const recipientHits = uniqueHits(text, testCase.recipientNames ?? [])
  const specificityHits = uniqueHits(text, testCase.positiveAnchors ?? [])
  const workflowHits = uniqueHits(text, testCase.workflowAnchors ?? [])
  const riskHits = uniqueHits(text, testCase.riskAnchors ?? [])
  const provenanceHits = uniqueHits(text, rubric.provenanceMarkers ?? [])

  const structureScore = ratioScore(structureHits.length, headings.length)

  const terminologyPenalty =
    forbiddenHits.length * 25 + discouragedHits.length * 10
  const terminologyScore = clamp(100 - terminologyPenalty)

  const specificityTarget =
    1 +
    (testCase.recipientNames?.length ?? 0) +
    (testCase.positiveAnchors?.length ?? 0)
  const specificityActual =
    companyHits.length + recipientHits.length + specificityHits.length
  const specificityScore = ratioScore(specificityActual, specificityTarget)

  const provenanceBonus = includesNormalized(text, 'data provenance') ? 1 : 0
  const provenanceScore = ratioScore(
    provenanceHits.length + provenanceBonus,
    (rubric.provenanceMarkers?.length ?? 0) + 1,
  )

  const workflowScore = ratioScore(
    workflowHits.length,
    testCase.workflowAnchors?.length ?? 0,
  )

  const risksSectionPresent = includesNormalized(text, 'risks & mitigations')
  const nextStepsPresent = includesNormalized(text, 'next steps')
  const numberedChecklistPresent = /(\n|^)1\.\s/.test(text)
  const riskSignalsScore = ratioScore(
    riskHits.length,
    testCase.riskAnchors?.length ?? 0,
  )
  const risksAndNextStepsScore = Math.round(
    clamp(
      riskSignalsScore * 0.5 +
        (risksSectionPresent ? 20 : 0) +
        (nextStepsPresent ? 20 : 0) +
        (numberedChecklistPresent ? 10 : 0),
    ),
  )

  const breakdown = {
    structure: {
      score: structureScore,
      hits: structureHits,
      expected: headings,
    },
    terminology: {
      score: terminologyScore,
      forbiddenHits,
      discouragedHits,
    },
    specificity: {
      score: specificityScore,
      companyHits,
      recipientHits,
      anchorHits: specificityHits,
      expectedAnchors: testCase.positiveAnchors ?? [],
    },
    provenance: {
      score: provenanceScore,
      hits: provenanceHits,
    },
    workflowQuality: {
      score: workflowScore,
      hits: workflowHits,
      expectedWorkflows: testCase.workflowAnchors ?? [],
    },
    risksAndNextSteps: {
      score: risksAndNextStepsScore,
      riskHits,
      risksSectionPresent,
      nextStepsPresent,
      numberedChecklistPresent,
    },
  }

  const totalScore = weightedTotal(breakdown, rubric.weights ?? {})

  return {
    totalScore,
    breakdown,
  }
}

export function loadCase(caseDir) {
  const actualPath = path.join(caseDir, 'actual.md')
  return {
    testCase: loadJson(path.join(caseDir, 'case.json')),
    reference: fs.readFileSync(path.join(caseDir, 'reference.md'), 'utf8'),
    actual: fs.existsSync(actualPath)
      ? fs.readFileSync(actualPath, 'utf8')
      : null,
  }
}
