import React from 'react'

export function Checkbox({
  label,
  checked,
  onChange,
  disabled,
  style,
  ...rest
}) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        font: 'var(--type-body)',
        color: 'var(--text-body)',
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        {...rest}
      />
      <span
        style={{
          width: 20,
          height: 20,
          flex: '0 0 auto',
          display: 'grid',
          placeItems: 'center',
          borderRadius: 'var(--radius-xs)',
          border:
            '1px solid ' +
            (checked ? 'var(--lyrise-purple)' : 'var(--border-strong)'),
          background: checked ? 'var(--lyrise-purple)' : 'var(--surface-card)',
          color: '#fff',
          transition: 'var(--transition-control)',
          font: '700 12px/1 var(--font-body)',
        }}
      >
        {checked ? '✓' : ''}
      </span>
      {label}
    </label>
  )
}
