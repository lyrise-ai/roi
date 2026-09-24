import React from 'react'
import { Icon } from '../core/Icon'
import { IconButton } from '../core/IconButton'

const statusCopy = {
  'cap-reached':
    "That's as far as I can go here. Book a call and we'll go through it together.",
  expired:
    'This conversation closed after 30 days. Book a call and we can pick it up together.',
}

function Message({ message }) {
  const isUser = message.kind === 'user'
  const isQuestionAnswer = message.kind === 'qa'
  const isScoped = message.kind === 'scoped'

  return (
    <article
      style={{
        alignSelf: isUser ? 'flex-end' : 'stretch',
        maxWidth: isUser ? '88%' : '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        alignItems: isUser ? 'flex-end' : 'stretch',
      }}
    >
      {isQuestionAnswer && (
        <div
          style={{
            alignSelf: 'flex-end',
            maxWidth: '92%',
            padding: 'var(--space-2) var(--space-3)',
            border: '1px solid var(--purple-200)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--text-accent)',
            font: 'var(--type-label)',
          }}
        >
          {message.question}
        </div>
      )}
      {isScoped && (
        <span
          style={{
            alignSelf: 'flex-start',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            color: 'var(--text-accent)',
            font: 'var(--type-eyebrow)',
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase',
          }}
        >
          <Icon name="target" size={14} />
          {message.scopeLabel}
        </span>
      )}
      <p
        style={{
          margin: 0,
          padding: 'var(--space-3) var(--space-4)',
          borderRadius: isUser
            ? 'var(--radius-lg) var(--radius-lg) var(--radius-xs) var(--radius-lg)'
            : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-xs)',
          background: isUser ? 'var(--lyrise-purple)' : 'var(--surface-subtle)',
          color: isUser ? 'var(--text-inverse)' : 'var(--text-body)',
          font: 'var(--type-body)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {message.text}
      </p>
    </article>
  )
}

export function ChatPanel({
  messages = [],
  suggestions = [],
  opener,
  scope,
  status = 'open',
  onSend,
  onClose,
  onOpen,
  style,
  ...rest
}) {
  const [draft, setDraft] = React.useState('')
  const [reopened, setReopened] = React.useState(false)

  React.useEffect(() => {
    setReopened(false)
  }, [status])

  const isClosed = status === 'closed' && !reopened
  const isUnavailable = status === 'cap-reached' || status === 'expired'
  const canSend = !isClosed && !isUnavailable

  const send = (text) => {
    const trimmed = text.trim()
    if (!trimmed || !canSend) return
    onSend(trimmed, scope)
    setDraft('')
  }

  return (
    <section
      aria-label="LyRise analyst"
      style={{
        width: 'min(100%, var(--container-narrow))',
        height: '100%',
        minHeight: 'var(--space-20)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-lg)',
        ...style,
      }}
      {...rest}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 'var(--space-3)',
              height: 'var(--space-3)',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--grow)',
              boxShadow: '0 0 0 var(--space-1) var(--purple-50)',
            }}
          />
          <h2 style={{ font: 'var(--type-h3)', color: 'var(--text-heading)' }}>
            LyRise analyst
          </h2>
        </div>
        <IconButton label="Close analyst chat" onClick={onClose}>
          <Icon name="x" size={20} />
        </IconButton>
      </header>

      <div
        aria-live="polite"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          overflowY: 'auto',
          padding: 'var(--space-5)',
          background: 'var(--surface-page)',
        }}
      >
        {isClosed ? (
          <div
            style={{
              margin: 'auto 0',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 'var(--space-4)',
              textAlign: 'center',
            }}
          >
            <p style={{ font: 'var(--type-body)', color: 'var(--text-body)' }}>
              The analyst is ready when you are.
            </p>
            <button
              type="button"
              onClick={() => {
                setReopened(true)
                onOpen?.()
              }}
              style={{
                minHeight: 'var(--space-10)',
                padding: 'var(--space-2) var(--space-4)',
                border: '1px solid var(--lyrise-purple)',
                borderRadius: 'var(--radius-pill)',
                background: 'transparent',
                color: 'var(--text-accent)',
                font: 'var(--type-label)',
                cursor: 'pointer',
              }}
            >
              Reopen the conversation
            </button>
          </div>
        ) : (
          <>
            {opener && <Message message={{ kind: 'analyst', text: opener }} />}
            {messages.map((message, index) => (
              <Message key={`${message.kind}-${index}`} message={message} />
            ))}
            {isUnavailable && (
              <p
                role="status"
                style={{
                  marginTop: 'auto',
                  padding: 'var(--space-3) var(--space-4)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  background: 'var(--surface-subtle)',
                  color: 'var(--text-muted)',
                  font: 'var(--type-label)',
                }}
              >
                {statusCopy[status]}
              </p>
            )}
          </>
        )}
      </div>

      {!isClosed && (
        <footer
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)',
            padding: 'var(--space-4) var(--space-5) var(--space-5)',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--surface-card)',
            flexShrink: 0,
          }}
        >
          {suggestions.length > 0 && canSend && (
            <div
              aria-label="Suggested questions"
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-2)',
              }}
            >
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => send(suggestion)}
                  style={{
                    maxWidth: '100%',
                    padding: 'var(--space-2) var(--space-3)',
                    border: '1px solid var(--purple-200)',
                    borderRadius: 'var(--radius-pill)',
                    background: 'var(--surface-accent-subtle)',
                    color: 'var(--text-accent)',
                    font: 'var(--type-label)',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {scope && (
            <span
              style={{
                alignSelf: 'flex-start',
                padding: 'var(--space-1) var(--space-3)',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--surface-accent-subtle)',
                color: 'var(--text-accent)',
                font: 'var(--type-eyebrow)',
                letterSpacing: 'var(--tracking-caps)',
                textTransform: 'uppercase',
              }}
            >
              Asking about {scope}
            </span>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault()
              send(draft)
            }}
            style={{
              display: 'flex',
              gap: 'var(--space-2)',
              alignItems: 'flex-end',
            }}
          >
            <label style={{ flex: '1 1 auto' }}>
              <span className="sr-only">Ask the analyst</span>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  canSend
                    ? 'Ask about a number in the report'
                    : 'Conversation closed'
                }
                disabled={!canSend}
                rows={2}
                style={{
                  width: '100%',
                  resize: 'vertical',
                  minHeight: 'var(--space-12)',
                  padding: 'var(--space-3)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-field)',
                  background: 'var(--surface-page)',
                  color: 'var(--text-body)',
                  font: 'var(--type-body)',
                }}
              />
            </label>
            <button
              type="submit"
              disabled={!canSend || !draft.trim()}
              aria-label="Send question"
              style={{
                width: 'var(--space-12)',
                height: 'var(--space-12)',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 0,
                borderRadius: 'var(--radius-pill)',
                background: 'var(--lyrise-purple)',
                color: 'var(--text-inverse)',
                cursor: canSend && draft.trim() ? 'pointer' : 'not-allowed',
                opacity: canSend && draft.trim() ? 1 : 0.4,
              }}
            >
              <Icon name="arrow-up" size={20} />
            </button>
          </form>
        </footer>
      )}
    </section>
  )
}
