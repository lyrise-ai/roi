// Currency/number formatting for the live report view — mirrors the display
// logic in src/lib/roi/pipeline/assembleReport.ts (fmt/cur/short) so figures
// read identically to the PDF/legacy template.

// Currencies whose official symbols are non-Latin script — always use the ISO
// code instead (kept in sync with assembleReport.ts's SCRIPT_SYMBOL_CODES).
const SCRIPT_SYMBOL_CODES = new Set([
  'SAR',
  'AED',
  'QAR',
  'KWD',
  'BHD',
  'OMR',
  'EGP',
  'JOD',
  'IQD',
  'LBP',
  'IRR',
  'YER',
])

export function addCommas(n) {
  const str = String(Math.round(n || 0))
  let out = ''
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += ','
    out += str[i]
  }
  return out
}

export function currencySymbolFor(currency) {
  const code = currency?.code ?? 'USD'
  const symbol = currency?.symbol ?? '$'
  // eslint-disable-next-line no-control-regex
  const hasNonAscii = /[^\x00-\x7F]/.test(symbol)
  const raw = SCRIPT_SYMBOL_CODES.has(code) || hasNonAscii ? code : symbol
  return raw.length > 1 && !raw.endsWith(' ') ? raw + ' ' : raw
}

export function fmtNumber(n) {
  return n != null && !Number.isNaN(+n) ? addCommas(+n) : '—'
}

export function fmtCurrency(n, currency) {
  return currencySymbolFor(currency) + fmtNumber(n)
}

// Abbreviated form used for large headline figures, e.g. "$125K" / "$1.2M".
export function fmtCurrencyShort(n, currency) {
  if (n == null || Number.isNaN(+n)) return '—'
  const v = Math.round(+n)
  const sym = currencySymbolFor(currency)
  if (v >= 1_000_000) return sym + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return sym + Math.round(v / 1_000) + 'K'
  return sym + fmtNumber(v)
}
