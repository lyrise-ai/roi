const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function parse(iso) {
  if (!iso) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  const d = new Date(hasZone ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

export function fmtDate(iso) {
  const d = parse(iso)
  if (!d) return '—'
  return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function fmtDateTime(iso) {
  const d = parse(iso)
  if (!d) return '—'
  const day = d.getUTCDate()
  const mon = MONTHS_SHORT[d.getUTCMonth()]
  const yr = d.getUTCFullYear()
  let hr = d.getUTCHours()
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  const sec = String(d.getUTCSeconds()).padStart(2, '0')
  const ampm = hr >= 12 ? 'PM' : 'AM'
  hr = hr % 12 || 12
  return `${day} ${mon} ${yr}, ${hr}:${min}:${sec} ${ampm}`
}
