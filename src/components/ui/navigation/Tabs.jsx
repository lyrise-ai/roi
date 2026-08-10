import React from 'react'

export function Tabs({
  tabs = [],
  value,
  onChange,
  variant = 'underline',
  style,
  ...rest
}) {
  const active = value ?? tabs[0]?.value
  const pill = variant === 'pill'
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        gap: pill ? 4 : 'var(--space-6)',
        alignItems: 'center',
        borderBottom: pill ? 'none' : '1px solid var(--border-subtle)',
        background: pill ? 'var(--neutral-100)' : 'transparent',
        padding: pill ? 4 : 0,
        borderRadius: pill ? 'var(--radius-pill)' : 0,
        ...style,
      }}
      {...rest}
    >
      {tabs.map((t) => {
        const on = t.value === active
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={on}
            type="button"
            onClick={() => onChange && onChange(t.value)}
            style={{
              border: 'none',
              cursor: 'pointer',
              font: 'var(--type-label)',
              transition: 'var(--transition-control)',
              background: pill
                ? on
                  ? 'var(--surface-card)'
                  : 'transparent'
                : 'transparent',
              color: on
                ? pill
                  ? 'var(--text-heading)'
                  : 'var(--lyrise-purple)'
                : 'var(--text-muted)',
              borderRadius: pill ? 'var(--radius-pill)' : 0,
              padding: pill ? '8px 16px' : '0 0 12px',
              boxShadow:
                pill && on
                  ? 'var(--shadow-xs)'
                  : !pill && on
                    ? 'inset 0 -2px 0 var(--lyrise-purple)'
                    : 'none',
            }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
