import React from 'react'

export function Switch({ label, checked, onChange, disabled, style, ...rest }) {
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
        role="switch"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
        {...rest}
      />
      <span
        style={{
          width: 44,
          height: 26,
          flex: '0 0 auto',
          borderRadius: 'var(--radius-pill)',
          padding: 3,
          background: checked ? 'var(--lyrise-purple)' : 'var(--neutral-300)',
          transition: 'background var(--duration-base) var(--ease-out)',
        }}
      >
        <span
          style={{
            display: 'block',
            width: 20,
            height: 20,
            borderRadius: 'var(--radius-pill)',
            background: '#fff',
            boxShadow: 'var(--shadow-xs)',
            transform: checked ? 'translateX(18px)' : 'none',
            transition: 'transform var(--duration-base) var(--ease-out)',
          }}
        />
      </span>
      {label}
    </label>
  )
}
