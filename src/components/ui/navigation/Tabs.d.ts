import type * as React from 'react'

/** Section switcher. `underline` for page-level views, `pill` for in-card filters. */
export interface TabsProps extends Omit<
  React.HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  tabs?: { value: string; label: string }[]
  value?: string
  onChange?: (value: string) => void
  variant?: 'underline' | 'pill'
}
export function Tabs(props: TabsProps): JSX.Element
