import React from 'react'

export function Select({ label, hint, options = [], id, style, ...rest }) {
  const [focus, setFocus] = React.useState(false)
  // See Input.jsx — useId must not sit behind a short-circuit.
  const autoId = React.useId()
  const selId = id || autoId
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        ...style,
      }}
    >
      {label && (
        <label
          htmlFor={selId}
          style={{ font: 'var(--type-label)', color: 'var(--text-heading)' }}
        >
          {label}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        <select
          id={selId}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={{
            width: '100%',
            appearance: 'none',
            background: 'var(--surface-card)',
            color: 'var(--text-heading)',
            border:
              '1px solid ' +
              (focus ? 'var(--lyrise-purple)' : 'var(--border-subtle)'),
            borderRadius: 'var(--radius-field)',
            padding: '13px 40px 13px 14px',
            font: 'var(--type-body)',
            outline: 'none',
            boxShadow: focus ? '0 0 0 3px var(--focus-ring)' : 'none',
            transition: 'var(--transition-control)',
          }}
          {...rest}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span
          style={{
            position: 'absolute',
            right: 14,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            color: 'var(--text-muted)',
            font: '600 11px/1 var(--font-body)',
          }}
        >
          ▼
        </span>
      </div>
      {hint && (
        <span
          style={{
            font: 'var(--weight-regular) var(--text-xs)/1.4 var(--font-body)',
            color: 'var(--text-muted)',
          }}
        >
          {hint}
        </span>
      )}
    </div>
  )
}
