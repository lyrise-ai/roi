import { useState } from 'react'

// Shared "send via email" state machine — used both by ReportViewer's
// toolbar button (resend to your own address) and EndingSection's "Loop in
// a colleague" card (send to anyone). Same underlying endpoint
// (/api/roi-share-email) either way; only the markup differs per caller,
// since ReportViewer is inline-styled and EndingSection is Tailwind.
export function useEmailSendControl({ reportId, defaultEmail = '', onSent }) {
  const [expanded, setExpanded] = useState(false)
  const [email, setEmail] = useState(defaultEmail)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(false)

  const open = () => {
    setExpanded(true)
    setSent(false)
    setError(false)
  }
  const cancel = () => setExpanded(false)

  const send = async () => {
    const to = email.trim()
    if (!to || sending) return
    setSending(true)
    setError(false)
    try {
      const res = await fetch('/api/roi-share-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, to }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSent(true)
      setExpanded(false)
      onSent?.(to)
    } catch (err) {
      setError(true)
    } finally {
      setSending(false)
    }
  }

  return { expanded, email, setEmail, sending, sent, error, open, cancel, send }
}
