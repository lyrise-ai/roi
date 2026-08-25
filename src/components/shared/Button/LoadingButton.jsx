import * as React from 'react'

// A plain CSS spinner. Its border takes the button's own text colour, so it
// always matches whatever button it sits in.
function Spinner({ size }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-middle"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}

// A thin wrapper that gives any button the same "working on it" behaviour: it
// disables itself and replaces its contents with a spinner, or with text you
// pass in, while it is loading. It renders a normal button by default, or a
// different component if you name one.
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
