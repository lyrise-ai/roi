// Turns a country name from an Apollo export into a three-letter currency code.
// Matches anywhere in the string, ignoring capitalisation. Falls back to US
// dollars.

const RULES: Array<{ test: (c: string) => boolean; ccy: string }> = [
  {
    test: (c) =>
      c.includes('united kingdom') ||
      c === 'uk' ||
      c.includes('britain') ||
      c.includes('england') ||
      c.includes('scotland') ||
      c.includes('wales'),
    ccy: 'GBP',
  },
  {
    test: (c) =>
      c.includes('united states') ||
      c === 'us' ||
      c === 'usa' ||
      c.includes('america'),
    ccy: 'USD',
  },
  {
    test: (c) =>
      c.includes('united arab') ||
      c.includes('uae') ||
      c.includes('emirates') ||
      c.includes('dubai') ||
      c.includes('abu dhabi'),
    ccy: 'AED',
  },
  { test: (c) => c.includes('egypt'), ccy: 'EGP' },
  { test: (c) => c.includes('saudi') || c.includes('ksa'), ccy: 'SAR' },
  { test: (c) => c.includes('qatar'), ccy: 'QAR' },
  { test: (c) => c.includes('kuwait'), ccy: 'KWD' },
  { test: (c) => c.includes('bahrain'), ccy: 'BHD' },
  { test: (c) => c.includes('oman'), ccy: 'OMR' },
  { test: (c) => c.includes('nigeria'), ccy: 'NGN' },
  { test: (c) => c.includes('south africa'), ccy: 'ZAR' },
  { test: (c) => c.includes('canada'), ccy: 'CAD' },
  { test: (c) => c.includes('australia'), ccy: 'AUD' },
  { test: (c) => c.includes('new zealand'), ccy: 'NZD' },
  { test: (c) => c.includes('india'), ccy: 'INR' },
  { test: (c) => c.includes('singapore'), ccy: 'SGD' },
  { test: (c) => c.includes('switzerland'), ccy: 'CHF' },
  { test: (c) => c.includes('japan'), ccy: 'JPY' },
  { test: (c) => c.includes('china'), ccy: 'CNY' },
  { test: (c) => c.includes('hong kong'), ccy: 'HKD' },
  {
    // Euro countries — the ones Apollo exports most often
    test: (c) =>
      [
        'germany',
        'france',
        'italy',
        'spain',
        'netherlands',
        'ireland',
        'belgium',
        'austria',
        'portugal',
        'greece',
        'finland',
        'luxembourg',
        'malta',
        'cyprus',
        'estonia',
        'latvia',
        'lithuania',
        'slovakia',
        'slovenia',
      ].some((country) => c.includes(country)),
    ccy: 'EUR',
  },
]

export function countryToCurrency(country: string): string {
  if (!country) return 'USD'
  const c = country.toLowerCase().trim()
  return RULES.find((rule) => rule.test(c))?.ccy ?? 'USD'
}
