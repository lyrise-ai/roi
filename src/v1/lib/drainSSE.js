// ─────────────────────────────────────────────────────────────────────────────
// drainSSE — reads a stream the server keeps open and pushes updates down.
// Used by both roi-report.jsx and ReportViewer.jsx.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads the stream to the end, treating each `data: {...}` line as JSON and
 * calling onEvent once per valid event.
 *
 * @param {ReadableStreamDefaultReader} reader
 * @param {TextDecoder} decoder
 * @param {(event: object) => void} onEvent
 * @param {string} [buffer]
 */
export async function drainSSE(reader, decoder, onEvent, buffer = '') {
  const { done, value } = await reader.read()
  if (done) return
  const chunk = buffer + decoder.decode(value, { stream: true })
  const lines = chunk.split('\n')
  const remaining = lines.pop()
  lines
    .filter((l) => l.startsWith('data: '))
    .reduce((acc, line) => {
      try {
        acc.push(JSON.parse(line.slice(6)))
      } catch {
        /* skip malformed */
      }
      return acc
    }, [])
    .forEach((event) => onEvent(event))
  await drainSSE(reader, decoder, onEvent, remaining)
}
