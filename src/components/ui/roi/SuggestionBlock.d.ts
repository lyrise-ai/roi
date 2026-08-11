import type * as React from 'react'

/** Researched suggestion offered beside the user's own input. Renders nothing when empty or failed. */
export interface SuggestionBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: 'resolved' | 'loading' | 'empty' | 'failed'
  /** Purple eyebrow naming where this came from — "From your website". */
  label?: string
  suggestion?: React.ReactNode
  source?: string
  sourceUrl?: string
  actionLabel?: string
  onUse?: () => void
  dismissLabel?: string
  onDismiss?: () => void
}
export function SuggestionBlock(props: SuggestionBlockProps): JSX.Element | null
