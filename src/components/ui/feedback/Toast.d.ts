import type * as React from 'react'

/** Transient notification. Accent dot carries the tone; no icons required. */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'success' | 'error' | 'info'
  title?: string
  message?: string
  onDismiss?: () => void
}
export function Toast(props: ToastProps): JSX.Element
