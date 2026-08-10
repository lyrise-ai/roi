import type * as React from 'react'

/** Square 20px checkbox with a purple filled checked state. */
export interface CheckboxProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
> {
  label?: React.ReactNode
  checked?: boolean
  disabled?: boolean
}
export function Checkbox(props: CheckboxProps): JSX.Element
