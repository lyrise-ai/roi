import { forwardRef, useCallback, useImperativeHandle, useState } from 'react'
import { drainSSE } from '@/src/lib/drainSSE'
import { REPORT_CHAT_MESSAGE_LIMIT } from '@/src/lib/roi/constants'

// Right-rail AI advisor for validation wizard steps 1-4. Wired identically to
// ReportViewer.jsx's chat panel (same /api/roi-agent SSE contract, same
// REPORT_CHAT_MESSAGE_LIMIT budget shared with the post-validation report's
// chat panel — no separate allowance for the wizard). Exposes `send()` via
// ref so ConfirmWorkflowsStep/ContextStep can push a synthesized message
// (e.g. "add a workflow we missed") through the same pipeline as a typed one.
function ChatPanel(
  { reportId, quickReplies = [], onWorkflowsChanged, initialMessagesUsed = 0 },
  ref,
) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "I'm your AI workflow advisor — ask me anything about these numbers, or use a quick reply to confirm a step.",
    },
  ])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  // Counter is only ever read inside its own updater, to flip limitReached.
  const [, setMessagesUsed] = useState(initialMessagesUsed)
  const [limitReached, setLimitReached] = useState(
    initialMessagesUsed >= REPORT_CHAT_MESSAGE_LIMIT,
  )

  const send = useCallback(
    async (overrideText) => {
      const text = (overrideText ?? draft).trim()
      if (!text || isSending || limitReached) return

      const chatHistory = [...messages, { role: 'user', content: text }]
      setMessages(chatHistory)
      if (!overrideText) setDraft('')
      setIsSending(true)

      try {
        const res = await fetch('/api/roi-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'chat',
            message: text,
            chatHistory,
            reportId,
          }),
        })

        if (res.status === 403) {
          setLimitReached(true)
          setIsSending(false)
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        let agentReply = ''
        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        await drainSSE(reader, decoder, (event) => {
          if (event.type === 'text_delta') {
            agentReply += event.delta
          } else if (event.type === 'report_update') {
            const workflows = event.state?.workflows
            if (Array.isArray(workflows)) onWorkflowsChanged?.(workflows)
          } else if (event.type === 'done') {
            setMessages([
              ...chatHistory,
              ...(event.messages?.length
                ? event.messages
                : agentReply
                  ? [{ role: 'assistant', content: agentReply }]
                  : []),
            ])
            setMessagesUsed((n) => {
              const next = n + 1
              if (next >= REPORT_CHAT_MESSAGE_LIMIT) setLimitReached(true)
              return next
            })
            setIsSending(false)
          } else if (event.type === 'error') {
            setIsSending(false)
          }
        })
      } catch {
        setIsSending(false)
      }
    },
    [draft, isSending, limitReached, messages, reportId, onWorkflowsChanged],
  )

  useImperativeHandle(ref, () => ({ send }), [send])

  return (
    <div className="flex w-[320px] shrink-0 flex-col border-l border-[#E5E7EB] bg-white p-5">
      <div className="mb-0.5 text-sm font-bold text-[#0F172A]">
        AI Workflow Advisor
      </div>
      <div className="mb-3.5 text-xs leading-[1.5] text-[#9CA3AF]">
        Helps validate these numbers &amp; answers questions as you go.
      </div>

      <div className="mb-3 flex flex-1 flex-col gap-2.5 overflow-y-auto">
        {messages.map((m, i) => {
          if (m.role === 'tool') return null
          const text =
            typeof m.content === 'string'
              ? m.content
              : Array.isArray(m.content)
                ? m.content
                    .filter((p) => p.type === 'text')
                    .map((p) => p.text)
                    .join('')
                    .trim()
                : ''
          if (!text) return null
          return (
            <div
              key={i}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-[12.5px] leading-[1.5] ${
                  m.role === 'user'
                    ? 'rounded-br-[3px] bg-[#5B48F8] text-white'
                    : 'rounded-bl-[3px] bg-[#F5F3FF] text-[#374151]'
                }`}
              >
                {text}
              </div>
            </div>
          )
        })}
        {isSending && (
          <div className="flex justify-start">
            <div className="rounded-xl rounded-bl-[3px] bg-[#F5F3FF] px-3.5 py-2.5 text-[12.5px] text-[#9CA3AF]">
              Thinking…
            </div>
          </div>
        )}
      </div>

      {limitReached ? (
        <div className="rounded-lg bg-[#FFFBEB] px-3 py-2.5 text-[11.5px] text-[#92400E]">
          You&apos;ve used all {REPORT_CHAT_MESSAGE_LIMIT} chat messages for
          this report. You can still finish validating without chat.
        </div>
      ) : (
        <>
          {quickReplies.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {quickReplies.map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => send(label)}
                  disabled={isSending}
                  className="rounded-full bg-[#F5F3FF] px-3 py-1.5 text-[11.5px] font-semibold text-[#5B48F8] hover:bg-[#EDE9FE] disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] px-2.5 py-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send()
              }}
              placeholder="Ask a question…"
              disabled={isSending}
              className="flex-1 border-none text-[13px] text-[#111827] outline-none"
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={isSending || !draft.trim()}
              className="rounded-md bg-[#0F172A] px-3 py-1.5 text-[11.5px] font-semibold text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default forwardRef(ChatPanel)
