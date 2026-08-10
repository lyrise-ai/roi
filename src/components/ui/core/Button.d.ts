import type * as React from 'react'

/**
 * Primary action control. Pill-shaped, per the capsule terminals of the LyRise wordmark.
 * @startingPoint section="Core" subtitle="Pill buttons in five brand variants" viewport="700x150"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual treatment. `glass` uses the Brand Manual glass recipe. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'inverse' | 'glass'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  fullWidth?: boolean
  iconLeft?: React.ReactNode
  iconRight?: React.ReactNode
  children?: React.ReactNode
}
export function Button(props: ButtonProps): JSX.Element
