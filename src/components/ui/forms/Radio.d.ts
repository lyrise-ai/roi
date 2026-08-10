import type * as React from 'react'

/** Single-choice control. Group by shared `name`. */
export interface RadioProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label?: React.ReactNode
  checked?: boolean
  name?: string
  value?: string
  disabled?: boolean
}
export function Radio(props: RadioProps): JSX.Element
