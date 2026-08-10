import React from 'react'

const tones = {
  purple: ['var(--purple-50)', 'var(--purple-700)'],
  grow: ['rgba(0,184,176,.12)', '#00776f'],
  power: ['rgba(238,49,36,.10)', '#c0261c'],
  sunny: ['rgba(247,144,30,.14)', '#a15c05'],
  trust: ['rgba(94,174,224,.16)', '#1f6c99'],
  neutral: ['var(--neutral-100)', 'var(--neutral-600)'],
}

export function Badge({ tone = 'purple', children, style, ...rest }) {
  const [bg, fg] = tones[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: bg,
        color: fg,
        font: 'var(--weight-semibold) var(--text-xs)/1 var(--font-body)',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        padding: '6px 10px',
        borderRadius: 'var(--radius-pill)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  )
}
