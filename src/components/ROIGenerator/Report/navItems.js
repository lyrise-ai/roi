// The 11 section-nav entries, shared by SectionNav (rendering + scroll-spy)
// and ReportContent (registering scrollable section refs). `changedKeys` is
// the reverse of ReportViewer's old hand-maintained CHANGED_TO_NAV_KEYS map —
// which chat-tool `changedSections` values (agent.ts) light this nav item up
// — kept here instead so there's one list instead of two independently
// maintained ones.
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

// Inverts NAV_ITEMS' changedKeys into { changedKey: [navKey, ...] } — the
// shape ReportViewer's chat-update handler actually needs.
export function buildChangedToNavKeys() {
  const map = {}
  NAV_ITEMS.forEach(({ key, changedKeys }) => {
    changedKeys.forEach((ck) => {
      ;(map[ck] ??= []).push(key)
    })
  })
  return map
}
