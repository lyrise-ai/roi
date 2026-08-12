Text field with label, hint and error states.

```jsx
<Input
  label="Work email"
  placeholder="you@company.com"
  hint="We never share this."
/>
```

`multiline` renders a resizable `<textarea>` in the same chrome — same label, border and focus ring, no separate component:

```jsx
<Input multiline rows={4} label="What's the worst part of it?" />
```

Fields use `--radius-field` (12px) — squarer than buttons, which are pills. Focus = 1px purple border + 3px `--focus-ring`.
