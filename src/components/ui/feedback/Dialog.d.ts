import type * as React from 'react'

/** Centred modal over a blurred dark-blue scrim. */
export interface DialogProps {
  open?: boolean
  title?: string
  description?: string
  onClose?: () => void
  footer?: React.ReactNode
  /** Max width in px. Default 480. */
  width?: number
  children?: React.ReactNode
}
export function Dialog(props: DialogProps): JSX.Element | null
