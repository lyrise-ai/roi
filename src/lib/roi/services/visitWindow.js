// When do two hits on a report count as the same visit?
//
// Our server code runs on every single request for /report/[id], and one person
// opening a report makes several: the page itself, then a follow-up data
// request from Next.js, plus any prefetch, refresh, or link scanner sitting in
// someone's inbox. Counting requests meant a first-time visitor was announced
// as "Return visit #3" — twice.
//
// So: a visit is a request with no other request shortly before it.

export const VISIT_WINDOW_MS = 30 * 60 * 1000

/**
 * @param {number[]} times when each request arrived, in milliseconds, oldest
 *   first
 * @returns {number[]} just the ones that start a visit: the first request, and
 *   any that comes after a long enough gap of nothing.
 */
export function visitStarts(times) {
  return times.filter((t, i) => i === 0 || t - times[i - 1] > VISIT_WINDOW_MS)
}
