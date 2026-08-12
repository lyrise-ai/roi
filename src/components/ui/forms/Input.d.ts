import type * as React from 'react'

/** Labelled text field. 12px radius; focus draws a purple ring. */
export interface InputProps extends React.InputHTMLAttributes<
  HTMLInputElement & HTMLTextAreaElement
> {
  label?: string
  hint?: string
  /** Error message; replaces `hint` and turns the field red. */
  error?: string
  iconLeft?: React.ReactNode
  /** Renders a resizable `<textarea>` in the same chrome. */
  multiline?: boolean
  /** Rows of the `<textarea>`; ignored unless `multiline`. */
  rows?: number
}
export function Input(props: InputProps): JSX.Element
