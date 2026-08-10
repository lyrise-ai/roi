import type * as React from 'react'

/**
 * The brand's signature container: white 60%→25% gradient fill, 40% white 1px border,
 * 15/15/15 drop shadow, optional 15px background blur (Brand Manual p.25).
 * @startingPoint section="Core" subtitle="Glass containers over reflection backgrounds" viewport="700x220"
 */
export interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `light` over imagery/pale areas; `dark` over deep-blue sections. */
  tone?: 'light' | 'dark'
  padding?: string
  /** Background blur is optional per the manual; disable when perf matters. */
  blur?: boolean
  children?: React.ReactNode
}
export function GlassPanel(props: GlassPanelProps): JSX.Element
