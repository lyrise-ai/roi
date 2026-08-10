/* The one place timestamps become strings.
   Three screens used to each carry their own copy of this; they drifted.

   Two hazards these helpers exist to absorb:

   1. Postgres hands back timestamps without a zone suffix ("2026-08-10 21:05:33").
      `new Date()` reads those as *local* time, which silently shifts every
      rendered date by the viewer's offset. `parseTimestamp` appends the Z.

   2. `toLocaleString()` picks its own date/time joiner ("," vs " at ") from the
      engine's bundled ICU/CLDR data, which differs between Node (SSR) and the
      browser — a hydration mismatch even when the instant agrees. So date and
      time are formatted separately and joined with a literal comma. */

export function parseTimestamp(iso) {
  if (!iso) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(iso)
  const d = new Date(hasZone ? iso : `${iso}Z`)
  return Number.isNaN(d.getTime()) ? null : d
}

const DATE_OPTS = { day: 'numeric', month: 'short', year: 'numeric' }
const TIME_OPTS = {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
}

// "10 Aug 2026"
export function fmtDate(iso) {
  const d = parseTimestamp(iso)
  return d ? d.toLocaleDateString('en-GB', DATE_OPTS) : '—'
}

// "10 Aug 2026, 9:05:33 PM" in the viewer's timezone.
export function fmtDateTime(iso) {
  const d = parseTimestamp(iso)
  if (!d) return '—'
  const time = d
    .toLocaleTimeString('en-GB', TIME_OPTS)
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase())
  return `${d.toLocaleDateString('en-GB', DATE_OPTS)}, ${time}`
}

// Same shape, pinned to UTC — usage metering buckets by UTC day, so rendering
// those rows in local time would disagree with the numbers beside them.
const UTC_DTF = new Intl.DateTimeFormat('en-US', {
  ...DATE_OPTS,
  ...TIME_OPTS,
  timeZone: 'UTC',
})

export function fmtDateTimeUTC(iso) {
  const d = parseTimestamp(iso)
  if (!d) return '—'
  const p = Object.fromEntries(
    UTC_DTF.formatToParts(d).map((x) => [x.type, x.value]),
  )
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}:${p.second} ${p.dayPeriod.toUpperCase()}`
}

// "just now" / "42m ago" / "3h ago" / "5d ago"
export function timeAgo(iso) {
  const d = parseTimestamp(iso)
  if (!d) return '—'
  const mins = Math.floor((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
