// When do two hits on a report count as one visit?
//
// getServerSideProps runs on every HTTP request for /report/[id], and one
// person opening a report makes several: the document, then Next's own
// `_next/data` fetch on hydration, plus any prefetch, refresh, or link
// scanner sitting in an ops mailbox. Counting requests meant a first-time
// visitor was announced as "Return visit #3", twice.
//
// A visit is a request with no earlier request close behind it.

export const VISIT_WINDOW_MS = 30 * 60 * 1000

/**
 * @param {number[]} times access timestamps in ms, ascending
 * @returns {number[]} the subset that begins a visit — the first one, and
 *   any that follows more than VISIT_WINDOW_MS of quiet.
 */
export function visitStarts(times) {
  return times.filter((t, i) => i === 0 || t - times[i - 1] > VISIT_WINDOW_MS)
}
