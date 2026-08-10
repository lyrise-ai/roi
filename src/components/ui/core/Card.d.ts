import type * as React from 'react'

/** Opaque content container: 16px radius, hairline border, soft shadow. */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'default' | 'subtle' | 'accent' | 'inverse'
  /** Adds lift-on-hover and a pointer cursor. */
  interactive?: boolean
  padding?: string
  children?: React.ReactNode
}
export function Card(props: CardProps): JSX.Element
