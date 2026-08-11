import type * as React from 'react'

/** One verified fact from the company scan, with its source always visible. */
export interface ScanFactRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** What was found — "Team size". */
  fact?: string
  /** What it says — "38 people". */
  value?: React.ReactNode
  source?: string
  sourceUrl?: string
  /** false renders a hollow ring and mutes the value: found, not confirmed. */
  verified?: boolean
  /** Drops the hairline on the last row of a panel. */
  last?: boolean
}
export function ScanFactRow(props: ScanFactRowProps): JSX.Element
