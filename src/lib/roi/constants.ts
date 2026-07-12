export const PIPELINE_LOG_TOOL_NAMES = [
  'web_search',
  'fetch_page',
  'set_research_output',
  'run_financial_model',
  'set_report_copy',
] as const

export const REPORT_CHAT_MESSAGE_LIMIT = 10

// Monthly validated value ($/mo) a report must clear to "qualify" for the
// next funnel stage (process mapping) — shown on the validation wizard's
// completion step. Tune freely; no migration needed.
export const VALIDATION_QUALIFY_MONTHLY_THRESHOLD = 10_000
