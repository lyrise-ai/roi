import type * as React from 'react'

/** Labelled single-line text field. 12px radius; focus draws a purple ring. */
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  /** Error message; replaces `hint` and turns the field red. */
  error?: string
  iconLeft?: React.ReactNode
}
export function Input(props: InputProps): JSX.Element
