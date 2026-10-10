import { createContext, useContext } from 'react'

// Single source of truth for all interaction state in the report body —
// mirrors the design prototype's state shape (one hovered tooltip, one open
// popover, one open workflow/lever accordion row at a time) so nested section
// components don't need state or setters prop-drilled through them.
const ReportUIContext = createContext(null)

export const ReportUIProvider = ReportUIContext.Provider

export function useReportUI() {
  const ctx = useContext(ReportUIContext)
  if (!ctx) {
    throw new Error('useReportUI must be used within a ReportUIProvider')
  }
  return ctx
}
