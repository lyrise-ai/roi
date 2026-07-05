import * as React from 'react'
import CircularProgress from '@mui/material/CircularProgress'
import PropTypes from 'prop-types'

// Thin wrapper that gives any button a consistent "in flight" affordance:
// disables itself and swaps its children for a spinner (or `loadingText`)
// while `loading` is true. Renders a native <button> by default, or another
// component (e.g. MUI's Button) via `as`, so it can drop into either style
// system already used across this app without changing any button's look.
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
      {loading
        ? (loadingText ?? (
            <CircularProgress size={spinnerSize} color="inherit" />
          ))
        : children}
    </Component>
  )
}

LoadingButton.propTypes = {
  as: PropTypes.elementType,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  loadingText: PropTypes.node,
  spinnerSize: PropTypes.number,
  children: PropTypes.node,
}
