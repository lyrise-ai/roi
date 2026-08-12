import React from 'react'

/* `multiline` swaps the <input> for a <textarea> inside the same chrome rather
   than adding a second component: the border, focus ring and label are the
   field's identity, not the tag's (P11). */
export function Input({
  label,
  hint,
  error,
  iconLeft,
  id,
  style,
  multiline,
  rows = 4,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false)
  // useId unconditionally — `id || React.useId()` short-circuits, so passing
  // `id` on one render and not the next changes the hook order.
  const autoId = React.useId()
  const inputId = id || autoId
  const borderColor = error
    ? 'var(--danger)'
    : focus
      ? 'var(--lyrise-purple)'
      : 'var(--border-subtle)'
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
          htmlFor={inputId}
          style={{ font: 'var(--type-label)', color: 'var(--text-heading)' }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: multiline ? 'stretch' : 'center',
          gap: 'var(--space-2)',
          background: 'var(--surface-card)',
          border: '1px solid ' + borderColor,
          borderRadius: 'var(--radius-field)',
          padding: '0 14px',
          boxShadow: focus ? '0 0 0 3px var(--focus-ring)' : 'none',
          transition: 'var(--transition-control)',
        }}
      >
        {iconLeft && (
          <span style={{ display: 'inline-flex', color: 'var(--text-muted)' }}>
            {iconLeft}
          </span>
        )}
        {React.createElement(multiline ? 'textarea' : 'input', {
          id: inputId,
          rows: multiline ? rows : undefined,
          onFocus: () => setFocus(true),
          onBlur: () => setFocus(false),
          style: {
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            padding: '13px 0',
            font: 'var(--type-body)',
            color: 'var(--text-heading)',
            minWidth: 0,
            resize: multiline ? 'vertical' : undefined,
          },
          ...rest,
        })}
      </div>
      {(error || hint) && (
        <span
          style={{
            font: 'var(--weight-regular) var(--text-xs)/1.4 var(--font-body)',
            color: error ? 'var(--danger)' : 'var(--text-muted)',
          }}
        >
          {error || hint}
        </span>
      )}
    </div>
  )
}
