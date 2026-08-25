// The three screens that show timestamps each used to carry their own copy of
// this code, and one of them had already drifted into reading timestamps with no
// timezone on them as local time.
//
// These tests pin down the two things the merged version must get right: a
// timestamp with no timezone means UTC, and the UTC formatter really does stay in
// UTC.
//
// Everything here is deliberately independent of what timezone you run it in,
// except for the UTC formatter. The other two format in the viewer's own
// timezone by design, so checking their exact text would only be testing that CI
// runs in the same timezone I do.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fmtDate,
  fmtDateTime,
  fmtDateTimeUTC,
  parseTimestamp,
  timeAgo,
} from '../formatDate.js'

test('a timestamp without a zone is read as UTC, not local', () => {
  assert.equal(
    parseTimestamp('2026-08-10 21:05:33').getTime(),
    Date.parse('2026-08-10T21:05:33Z'),
  )
  // and the two formatters agree with each other, which is the bug people
  // actually saw
  assert.equal(
    fmtDateTime('2026-08-10 21:05:33'),
    fmtDateTime('2026-08-10T21:05:33Z'),
  )
})

test('an explicit offset is honoured rather than overwritten', () => {
  assert.equal(
    parseTimestamp('2026-08-10T21:05:33+02:00').getTime(),
    Date.parse('2026-08-10T19:05:33Z'),
  )
})

test('missing and unparseable values render as an em dash, never Invalid Date', () => {
  for (const bad of [null, undefined, '', 'not a date']) {
    assert.equal(parseTimestamp(bad), null)
    assert.equal(fmtDate(bad), '—')
    assert.equal(fmtDateTime(bad), '—')
    assert.equal(fmtDateTimeUTC(bad), '—')
    assert.equal(timeAgo(bad), '—')
  }
})

test('fmtDateTimeUTC is pinned to UTC regardless of the host timezone', () => {
  assert.equal(
    fmtDateTimeUTC('2026-08-10T21:05:33Z'),
    '10 Aug 2026, 9:05:33 PM',
  )
  assert.equal(
    fmtDateTimeUTC('2026-01-02T00:00:00Z'),
    '2 Jan 2026, 12:00:00 AM',
  )
})

test('fmtDate and fmtDateTime keep the "date, time" shape', () => {
  const date = fmtDate('2026-08-10T21:05:33Z')
  assert.match(date, /^\d{1,2} [A-Z][a-z]{2} \d{4}$/)
  assert.equal(fmtDateTime('2026-08-10T21:05:33Z').split(', ')[0], date)
  // AM and PM in capitals, and the seconds are kept
  assert.match(fmtDateTime('2026-08-10T21:05:33Z'), /\d:\d{2}:\d{2} (AM|PM)$/)
})

test('timeAgo buckets by minute, hour, then day', () => {
  const ago = (ms) => timeAgo(new Date(Date.now() - ms).toISOString())
  assert.equal(ago(5_000), 'just now')
  assert.equal(ago(42 * 60_000), '42m ago')
  assert.equal(ago(3 * 3_600_000), '3h ago')
  assert.equal(ago(5 * 86_400_000), '5d ago')
})
