// The 11 entries in the report's side navigation. Two things use this list: the
// nav itself, for drawing and for tracking which section you are looking at, and
// the report body, for registering where each section starts.
//
// Each entry also lists which section names from the chat tools should light it
// up. That used to be a separate map, kept by hand in ReportViewer. It lives here
// now, so there is one list instead of two that drift apart.
export const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', changedKeys: ['financials', 'thesis'] },
  { key: 'snapshot', label: 'Company Snapshot', changedKeys: [] },
  { key: 'workflows', label: 'AI Workflows', changedKeys: ['workflows'] },
  { key: 'uplift', label: 'Profit Uplift', changedKeys: ['profit_levers'] },
  { key: 'outlook', label: '3-Year Outlook', changedKeys: ['financials'] },
  { key: 'delay', label: 'Cost of Delay', changedKeys: ['cost_of_delay'] },
  { key: 'resilience', label: 'Resilience', changedKeys: ['resilience_rows'] },
  { key: 'sources', label: 'Sources & Assumptions', changedKeys: [] },
  { key: 'risks', label: 'Risks', changedKeys: ['risks'] },
  { key: 'roadmap', label: 'Roadmap', changedKeys: ['pilot'] },
  { key: 'next', label: 'Next Steps', changedKeys: ['cta'] },
]

// Flips that list around, into "for this section name, light up these nav
// entries" — which is the shape the chat-update handler actually needs.
export function buildChangedToNavKeys() {
  const map = {}
  NAV_ITEMS.forEach(({ key, changedKeys }) => {
    changedKeys.forEach((ck) => {
      ;(map[ck] ??= []).push(key)
    })
  })
  return map
}
