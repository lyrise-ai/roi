import type * as React from 'react'

/** Dark-blue hover label. Fades in over 120ms; never carries interactive content. */
export interface TooltipProps {
  label: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  children?: React.ReactNode
}
export function Tooltip(props: TooltipProps): JSX.Element
