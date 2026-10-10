// Status pill colors + hover definitions, shared by Company Snapshot, Workflows,
// and Sources & Assumptions. Ported from the design prototype's pillColors()/statusDef().

export const STATUS_STYLES = {
  Provided: { bg: '#ECFDF5', fg: '#059669' },
  Scraped: { bg: '#F5F3FF', fg: '#7C3AED' },
  Benchmarked: { bg: '#EFF6FF', fg: '#2563EB' },
  Assumed: { bg: '#FEF2F2', fg: '#DC2626' },
  Validated: { bg: '#ECFDF5', fg: '#059669' },
  'Needs validation': { bg: '#FEF3C7', fg: '#B45309' },
  'Industry standard': { bg: '#EFF6FF', fg: '#2563EB' },
}

export const STATUS_DEFS = {
  Provided: 'You told us this directly — the most reliable input we have.',
  Scraped:
    'Pulled from public sources specific to your company, industry, or role.',
  Benchmarked:
    'Derived from industry patterns and comparable companies rather than your specific data — a reasonable starting estimate.',
  Assumed:
    'A default assumption used to build the first draft. Confirm or correct this in your validation session.',
  Validated:
    'Confirmed as accurate — either provided by you or cross-checked against a specific, current source.',
  'Needs validation':
    'An estimate based on benchmarks or scraped data. Worth confirming with your own numbers before board or investor use.',
  'Industry standard':
    'A widely observed pattern for this input, drawn from established research.',
}

export function statusStyle(status) {
  return STATUS_STYLES[status] || { bg: '#F3F4F6', fg: '#6B7280' }
}

export function statusDef(status) {
  return STATUS_DEFS[status] || status
}

export const RESILIENCE_DIM_DEFS = {
  'Cost per unit':
    'How much it costs, in time and money, to process one qualified opportunity end-to-end.',
  'Delivery speed':
    'How quickly a workflow moves from trigger (a lead, a call) to a completed output.',
  'Error rate':
    'How often manual handoffs lose context, miss fields, or require rework.',
  'Strategic capacity':
    'How much senior/leadership time is available for high-value work instead of coordination.',
}

export function resilienceDimDef(dim) {
  return RESILIENCE_DIM_DEFS[dim] || dim
}
