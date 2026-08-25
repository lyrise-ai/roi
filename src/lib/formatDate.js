/* The one place timestamps turn into text.
   Three screens each used to carry their own copy of this, and they drifted
   apart.

   Two traps these helpers exist to absorb:

   1. Our database returns timestamps with no timezone on the end, like
      "2026-08-10 21:05:33". JavaScript reads those as LOCAL time, which quietly
      shifts every date on screen by the viewer's own offset. So we add the
      timezone marker ourselves.

   2. The built-in formatter chooses its own joining text between the date and
      the time — a comma, or the word "at" — from data bundled with whatever is
      running it. That differs between our server and the browser, so the page
      would render one way on the server and another in the browser, even with
      the same instant. So we format the date and the time separately and join
      them with a comma ourselves. */

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
