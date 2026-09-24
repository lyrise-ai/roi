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
/>
```

`status="closed"` shows a reopen nudge. `cap-reached` and `expired` keep the
conversation visible while disabling the composer and showing their terminal
message. A non-null `scope` is sent unchanged with every question, including a
tapped suggestion.
