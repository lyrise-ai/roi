// ─────────────────────────────────────────────────────────────────────────────
// domain.ts — Clean domain parser for V2 (LYR-187 / LYR-236)
//
// Extracts and validates clean hostnames from raw website input on both client
// and server, preventing malformed addresses (e.g. spaces, missing labels).
// ─────────────────────────────────────────────────────────────────────────────

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

  if (value.length > 253) return null
  const labels = value.split('.')
  if (labels.length < 2) return null
  return labels.every(isValidLabel) ? value : null
}
