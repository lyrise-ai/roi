import React from 'react'

export function Radio({
  label,
  checked,
  onChange,
  name,
  value,
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
        type="radio"
        name={name}
        value={value}
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
          borderRadius: 'var(--radius-pill)',
          border:
            '1px solid ' +
            (checked ? 'var(--lyrise-purple)' : 'var(--border-strong)'),
          background: 'var(--surface-card)',
          transition: 'var(--transition-control)',
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 'var(--radius-pill)',
            background: checked ? 'var(--lyrise-purple)' : 'transparent',
          }}
        />
      </span>
      {label}
    </label>
  )
}
