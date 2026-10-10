export const PIPELINE_LOG_TOOL_NAMES = [
  'web_search',
  'fetch_page',
  'set_research_output',
  'run_financial_model',
  'set_report_copy',
] as const

export const REPORT_CHAT_MESSAGE_LIMIT = 10

// How much monthly value a report has to reach, after the user has checked the
// numbers, to count as worth taking to the next stage (process mapping). Shown
// on the last step of the wizard. Change it freely; nothing else depends on
// it.
export const VALIDATION_QUALIFY_MONTHLY_THRESHOLD = 10_000
