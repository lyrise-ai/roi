import type * as React from 'react'

export type SegmentedInputMode = 'exact' | 'range' | 'estimate'
export type ProvenanceKind = 'given' | 'scraped' | 'benchmarked' | 'estimated'

export interface SegmentedInputValue {
  mode?: SegmentedInputMode
  exact?: string | number
  low?: string | number
  high?: string | number
}

/** One number question, three equal-weight ways to answer it. */
export interface SegmentedInputProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  label?: string
  hint?: string
  /** Rendered inside the field, before the caret — e.g. "$". */
  prefix?: string
  /** Rendered inside the field, after the caret — e.g. "hours a week". */
  suffix?: string
  placeholder?: string
  value?: SegmentedInputValue
  onChange?: (next: SegmentedInputValue) => void
  /** Formatted estimate shown in the AI path. */
  estimate?: React.ReactNode
  /** One line saying where the estimate came from. Required whenever `estimate` is set. */
  estimateBasis?: string
  estimateSource?: Exclude<ProvenanceKind, 'given'>
  estimateLoading?: boolean
  escapeLabel?: string
  /** Defaults to switching back to the exact mode. */
  onEscape?: () => void
}
export function SegmentedInput(props: SegmentedInputProps): JSX.Element
