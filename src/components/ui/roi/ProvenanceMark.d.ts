import type * as React from 'react'

export type ProvenanceKind = 'given' | 'scraped' | 'benchmarked' | 'estimated'

/** Inline traceability mark after a number that carries assumptions. Renders nothing for `given`. */
export interface ProvenanceMarkProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: ProvenanceKind
  /** `dot` beside display figures, `pill` where the kind must be readable. */
  variant?: 'dot' | 'pill'
  /** Overrides the kind's own word in the pill and the accessible name. */
  label?: string
  onClick?: React.MouseEventHandler<HTMLButtonElement>
}
export function ProvenanceMark(props: ProvenanceMarkProps): JSX.Element | null
