// Currency/number formatting shared by the calculator, PDF assembler, and
// live report view — single copy (was independently duplicated 3x).

import type { Currency } from '@/src/lib/roi/types'

// Currencies whose official symbols are non-Latin script — always use the ISO
// code instead.
export const SCRIPT_SYMBOL_CODES = new Set([
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

export function addCommas(n: number): string {
  const str = String(Math.round(n || 0))
  let out = ''
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) out += ','
    out += str[i]
  }
  return out
}

export function currencySymbolFor(currency?: Partial<Currency> | null): string {
  const code = currency?.code ?? 'USD'
  const symbol = currency?.symbol ?? '$'
  // eslint-disable-next-line no-control-regex
  const hasNonAscii = /[^\x00-\x7F]/.test(symbol)
  const raw = SCRIPT_SYMBOL_CODES.has(code) || hasNonAscii ? code : symbol
  return raw.length > 1 && !raw.endsWith(' ') ? raw + ' ' : raw
}

export function fmtNumber(n: number | null | undefined): string {
  return n != null && !Number.isNaN(+n) ? addCommas(+n) : '—'
}

export function fmtCurrency(
  n: number | null | undefined,
  currency?: Partial<Currency> | null,
): string {
  return currencySymbolFor(currency) + fmtNumber(n)
}

// Abbreviated form used for large headline figures, e.g. "$125K" / "$1.2M".
export function fmtCurrencyShort(
  n: number | null | undefined,
  currency?: Partial<Currency> | null,
): string {
  if (n == null || Number.isNaN(+n)) return '—'
  const v = Math.round(+n)
  const sym = currencySymbolFor(currency)
  if (v >= 1_000_000) return sym + (v / 1_000_000).toFixed(1) + 'M'
  if (v >= 1_000) return sym + Math.round(v / 1_000) + 'K'
  return sym + fmtNumber(v)
}
