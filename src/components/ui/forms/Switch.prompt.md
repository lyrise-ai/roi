Toggle for settings that take effect immediately (use `Checkbox` inside forms that need submitting).

```jsx
<Switch
  label="Auto-run agent"
  checked={on}
  onChange={(e) => setOn(e.target.checked)}
/>
```
