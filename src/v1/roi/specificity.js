export function assessReportSpecificity(state) {
  const evidenceCount = state?.evidenceItems?.length ?? 0
  const workflows = state?.workflows ?? []
  const researchDerivedWorkflowCount = workflows.filter(
    (workflow) => workflow.sourceType === 'research_derived',
  ).length
  const inferredWorkflowCount = workflows.filter(
    (workflow) => workflow.sourceType === 'inferred',
  ).length
  const scrapedSnapshotCount =
    state?.copy?.company_snapshot?.filter(
      (item) => item.sourceType === 'scraped',
    ).length ?? 0

  const companySignalCount = [
    state?.company?.employees,
    state?.company?.revenueEstimateM,
    state?.company?.country,
    state?.company?.primaryFocus,
    state?.company?.industry,
  ].filter(Boolean).length

  let score = 0
  const warnings = []

  if (evidenceCount >= 5) score += 35
  else if (evidenceCount >= 3) score += 25
  else if (evidenceCount >= 1) score += 10
  else warnings.push('No research evidence was persisted for this report.')

  if (researchDerivedWorkflowCount >= 2) score += 30
  else if (researchDerivedWorkflowCount >= 1) score += 18
  else warnings.push('No workflows are currently marked as research-derived.')

  if (scrapedSnapshotCount >= 2) score += 20
  else if (scrapedSnapshotCount >= 1) score += 12
  else warnings.push('Company snapshot lacks directly scraped facts.')

  if (companySignalCount >= 4) score += 15
  else if (companySignalCount >= 2) score += 8
  else
    warnings.push(
      'Company profile is missing enough concrete operating signals.',
    )

  if (inferredWorkflowCount >= workflows.length && workflows.length > 0) {
    warnings.push(
      'All workflows are inferred, which is a strong generic-output signal.',
    )
  }

  const level = score >= 70 ? 'strong' : score >= 45 ? 'moderate' : 'weak'

  return {
    score,
    level,
    evidenceCount,
    researchDerivedWorkflowCount,
    inferredWorkflowCount,
    scrapedSnapshotCount,
    companySignalCount,
    warnings,
  }
}
