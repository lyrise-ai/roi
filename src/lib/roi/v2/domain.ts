// domain — cuts a typed website down to a plain domain, or null.
// Used by /v2 in the browser and by the research code on the server.

function isValidLabel(label: string): boolean {
  if (label.length === 0 || label.length > 63) return false
  if (label.startsWith('-') || label.endsWith('-')) return false
  for (const char of label) {
    const isDigit = char >= '0' && char <= '9'
    const isLetter = char >= 'a' && char <= 'z'
    if (!isDigit && !isLetter && char !== '-') return false
  }
  return true
}

export function cleanDomain(input?: string | null): string | null {
  if (typeof input !== 'string') return null
  let value = input.trim().toLowerCase()
  if (value === '') return null

  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  value = value.split(/[/?#]/)[0]
  value = value.replace(/^www\./, '')
  value = value.split('@').pop() || ''
  value = value.split(':')[0]

  /* Checked piece by piece rather than with one big pattern over the whole
     name. The obvious pattern for this can take exponentially long on a long
     hostile string, and this function sits on the boundary where outside input
     comes in: the domain is whatever the prospect typed. Splitting it first
     makes the check fast and impossible to trip up. */
  if (value.length > 253) return null
  const labels = value.split('.')
  if (labels.length < 2) return null
  return labels.every(isValidLabel) ? value : null
}
