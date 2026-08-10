import type * as React from 'react'

/** Instant-apply on/off toggle (44×26px track). */
export interface SwitchProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label?: React.ReactNode
  checked?: boolean
  disabled?: boolean
}
export function Switch(props: SwitchProps): JSX.Element
