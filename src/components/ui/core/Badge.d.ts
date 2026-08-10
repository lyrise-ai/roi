import type * as React from 'react'

/** Small uppercase status pill. Tones map to the secondary brand colour names. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'purple' | 'grow' | 'power' | 'sunny' | 'trust' | 'neutral'
  children?: React.ReactNode
}
export function Badge(props: BadgeProps): JSX.Element
