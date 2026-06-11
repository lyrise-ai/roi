import React from 'react'

function parseComponentStack(stack) {
  if (!stack) return []
  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.includes('node_modules'))
    .map((line) => {
      const match = line.match(
        /at (\w+) \(webpack-internal:\/\/\/\.\/(.+?):(\d+):\d+\)/,
      )
      if (match) return { name: match[1], file: match[2], line: match[3] }
      const fallback = line.match(/at (\w+)/)
      if (fallback) return { name: fallback[1], file: null, line: null }
      return null
    })
    .filter(Boolean)
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      componentStack: null,
      errorTime: null,
      url: null,
    }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error, errorTime: new Date().toISOString() }
  }

  componentDidCatch(error, info) {
    this.setState({
      componentStack: info.componentStack,
      url: typeof window !== 'undefined' ? window.location.href : null,
    })
    const { isEmployee, pageContext } = this.props
    if (!isEmployee) {
      fetch('/api/notify-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error.message,
          stack: info.componentStack,
          context: pageContext,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
        }),
      }).catch(() => {})
    }
  }

  render() {
    const { hasError, error, componentStack, errorTime, url } = this.state
    const { isEmployee, children, pageContext } = this.props

    if (!hasError) return children

    if (isEmployee) {
      const parsed = parseComponentStack(componentStack)
      const origin = parsed[0]
      const chain = parsed.map((c) => c.name).join(' → ')

      const contextLines = pageContext
        ? Object.entries(pageContext).map(([k, v]) => `${k}: ${v}`)
        : []

      const copyText = [
        `Error: ${error?.message}`,
        `Time: ${errorTime}`,
        url ? `URL: ${url}` : '',
        origin
          ? `Location: ${origin.file}:${origin.line} in ${origin.name}`
          : '',
        ...contextLines,
        '',
        'Component chain:',
        chain,
        '',
        'Full component stack:',
        componentStack ?? '',
      ]
        .filter((l) => l !== undefined)
        .join('\n')

      return (
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-red-100">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0" />
                  <h2 className="font-outfit text-base font-bold text-red-700">
                    Render Error
                  </h2>
                </div>
                <p className="font-mono text-sm text-red-600 ml-[18px] break-all">
                  {error?.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(copyText).catch(() => {})
                }
                className="ml-4 flex-shrink-0 font-outfit text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-lg px-3 py-1.5 hover:border-gray-400 transition-colors"
              >
                Copy
              </button>
            </div>

            {/* Where */}
            {origin && (
              <div className="px-6 py-4 border-b border-red-100">
                <p className="font-outfit text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Where
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-mono text-sm font-semibold text-gray-800">
                    {origin.name}
                  </span>
                  <span className="text-gray-300">·</span>
                  <span className="font-mono text-xs text-gray-500">
                    {origin.file}
                    {origin.line ? `:${origin.line}` : ''}
                  </span>
                </div>
              </div>
            )}

            {/* URL */}
            {url && (
              <div className="px-6 py-4 border-b border-red-100">
                <p className="font-outfit text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  URL
                </p>
                <p className="font-mono text-xs text-gray-600 break-all">{url}</p>
              </div>
            )}

            {/* Page context */}
            {pageContext && Object.keys(pageContext).length > 0 && (
              <div className="px-6 py-4 border-b border-red-100">
                <p className="font-outfit text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Context
                </p>
                <div className="flex flex-col gap-1">
                  {Object.entries(pageContext).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className="font-outfit text-xs text-gray-400 w-20 flex-shrink-0">{k}</span>
                      <span className="font-mono text-xs text-gray-600">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Component chain */}
            {chain && (
              <div className="px-6 py-4 border-b border-red-100">
                <p className="font-outfit text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Component chain
                </p>
                <p className="font-mono text-xs text-gray-600 leading-relaxed break-all">
                  {chain}
                </p>
              </div>
            )}

            {/* Timestamp */}
            <div className="px-6 py-3 bg-red-100/40">
              <p className="font-outfit text-xs text-gray-400">{errorTime}</p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <div
          className="flex items-center justify-center w-14 h-14 mx-auto mb-5 rounded-full"
          style={{ background: '#fff7ed', border: '1px solid #fed7aa' }}
        >
          <span style={{ fontSize: 24 }}>⚠</span>
        </div>
        <h2 className="font-outfit text-xl font-bold text-gray-900 mb-2">
          Something went wrong
        </h2>
        <p className="font-outfit text-sm text-gray-500 leading-relaxed">
          We&apos;re sorry — something unexpected happened. Our team has been
          notified and will look into it shortly.
        </p>
      </div>
    )
  }
}

export default ErrorBoundary
