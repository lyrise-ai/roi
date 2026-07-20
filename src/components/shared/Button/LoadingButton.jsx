import * as React from 'react'

// Plain CSS spinner (Tailwind's animate-spin) — `border-current` inherits the
// button's text color, matching MUI CircularProgress's `color="inherit"`.
function Spinner({ size }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-middle"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}

// Thin wrapper that gives any button a consistent "in flight" affordance:
// disables itself and swaps its children for a spinner (or `loadingText`)
// while `loading` is true. Renders a native <button> by default, or another
// component via `as`.
export default function LoadingButton({
  as: Component = 'button',
  loading = false,
  disabled = false,
  loadingText = null,
  spinnerSize = 16,
  children,
  ...props
}) {
  return (
    <Component disabled={disabled || loading} {...props}>
      {loading ? (loadingText ?? <Spinner size={spinnerSize} />) : children}
    </Component>
  )
}
