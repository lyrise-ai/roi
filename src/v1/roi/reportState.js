function createEmptyReportState() {
  return {
    normInput: null,
    company: null,
    globals: null,
    workflows: null,
    copy: null,
    calcOutput: null,
    assembled: null,
    renderedHtml: null,
    renderedFullHtml: null,
    confidenceLevel: null,
    coreThesis: null,
    painPoints: [],
    researchSummary: null,
    evidenceItems: [],
    specificityAssessment: null,
  }
}

export function buildStateFromReportRow(report) {
  const base = createEmptyReportState()
  const stateData = report?.state_data ?? {}

  return {
    ...base,
    ...stateData,
    normInput: stateData.normInput ?? report?.input_data ?? base.normInput,
    renderedHtml:
      report?.rendered_html ?? stateData.renderedHtml ?? base.renderedHtml,
    renderedFullHtml:
      report?.rendered_full_html ??
      stateData.renderedFullHtml ??
      base.renderedFullHtml,
    painPoints: stateData.painPoints ?? base.painPoints,
    researchSummary: stateData.researchSummary ?? base.researchSummary,
    evidenceItems: stateData.evidenceItems ?? base.evidenceItems,
    specificityAssessment:
      stateData.specificityAssessment ?? base.specificityAssessment,
  }
}

export function splitStoredState(state) {
  const {
    renderedHtml = null,
    renderedFullHtml = null,
    ...stateData
  } = state ?? {}

  return {
    stateData,
    renderedHtml,
    renderedFullHtml,
  }
}
