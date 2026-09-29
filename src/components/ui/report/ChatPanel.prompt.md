The report conversation panel. It renders already-written messages and forwards
questions to the owner; it never calls a model or calculates a report value.

```jsx
<ChatPanel
  opener="One thing below I'd like you to check. Or ask me about any number in the report."
  messages={messages}
  suggestions={['How did you calculate the uplift?']}
  scope="Profit uplift"
  status="open"
  onSend={(text, scope) => saveQuestion({ text, scope })}
  onClose={closeChat}
  onOpen={openChat}
/>
```

`status="closed"` shows a reopen nudge. Its button calls the required `onOpen`
callback; the parent must change `status` back to `open`. `cap-reached` and
`expired` keep the conversation visible while disabling the composer and
showing their terminal message. A non-null `scope` is sent unchanged with every
question, including a tapped suggestion. Tapping a suggestion leaves any text
in the composer untouched.
