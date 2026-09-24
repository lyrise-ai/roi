import type * as React from 'react'

export type ChatMessage =
  | { kind: 'user'; text: string }
  | { kind: 'analyst'; text: string }
  | { kind: 'qa'; question: string; text: string }
  | { kind: 'scoped'; scopeLabel: string; text: string }

export interface ChatPanelProps extends React.HTMLAttributes<HTMLElement> {
  messages: ChatMessage[]
  suggestions: string[]
  opener: string
  scope: string | null
  status: 'open' | 'closed' | 'cap-reached' | 'expired'
  onSend: (text: string, scope: string | null) => void
  onClose: () => void
}

export function ChatPanel(props: ChatPanelProps): JSX.Element
