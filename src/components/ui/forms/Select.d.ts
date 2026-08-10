import type * as React from 'react'

/** Native select styled to match `Input`. */
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  options?: { value: string; label: string }[]
}
export function Select(props: SelectProps): JSX.Element
