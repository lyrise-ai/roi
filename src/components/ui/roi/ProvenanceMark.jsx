import React from 'react'

/* Traceability, not warning. A number that carries assumptions gets a small
   purple mark after it; click it to see which assumptions.
   Two rules hold this apart from the rest of the report:
   - a value the user gave gets NO mark at all (kind="given" renders nothing) —
     absence is the clean state, so marks stay rare enough to mean something;
   - never a dashed underline, which already means "click for the calculation".
   All three kinds are purple; the label carries the difference, so no kind
   reads as more alarming than another. */

const KINDS = {
  scraped: 'Scraped',
  benchmarked: 'Benchmarked',
  estimated: 'Estimated',
}

export function ProvenanceMark({
  kind = 'estimated',
  variant = 'dot',
  label,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false)
  if (!kind || kind === 'given') return null
  const text = label || KINDS[kind] || kind
  const shared = {
    display: 'inline-flex',
    alignItems: 'center',
    verticalAlign: 'middle',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'var(--transition-control)',
  }
  const common = {
    onClick,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    title: text + ' — includes assumptions. See which.',
    'aria-label': text + ' — includes assumptions. See which.',
  }

  if (variant === 'pill') {
    return (
      <button
        type="button"
        {...common}
        style={{
          ...shared,
          gap: 5,
          marginLeft: 8,
          minHeight: 'var(--space-8)',
          padding: 'var(--space-1) var(--space-3)',
          borderRadius: 'var(--radius-pill)',
          background: hover ? 'var(--purple-100)' : 'var(--purple-50)',
          color: 'var(--purple-700)',
          font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-body)',
          letterSpacing: 'var(--tracking-caps)',
          textTransform: 'uppercase',
          ...style,
        }}
        {...rest}
      >
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--lyrise-purple)',
          }}
        />
        {text}
      </button>
    )
  }

  return (
    <button
      type="button"
      {...common}
      style={{
        ...shared,
        minWidth: 'var(--space-10)',
        minHeight: 'var(--space-10)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        margin: '0 0 0 calc(-1 * var(--space-1))',
        borderRadius: 'var(--radius-pill)',
        background: hover ? 'var(--purple-100)' : 'transparent',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: 'var(--radius-pill)',
          background: 'var(--lyrise-purple)',
          display: 'block',
        }}
      />
    </button>
  )
}
