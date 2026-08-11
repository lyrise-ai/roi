Asks for one number and offers three equal-weight ways to answer: **Exact · A range · Let AI estimate**. `exact` is pre-selected.

```jsx
<SegmentedInput
  label="What one of these people costs you a year"
  prefix="$"
  value={value}
  onChange={setValue}
  estimate="$74,000"
  estimateBasis="Benchmarked against 40 operations teams of your size in your city."
  estimateSource="benchmarked"
/>
```

**Equal weight is the constraint, not a preference.** The three segments are the same size, weight and colour; none carries an icon, a badge or a "recommended" hint. If the AI path looks like the easy option, everyone takes it and the numbers stop being challenged.

The AI path shows the estimate, a provenance tag (`scraped` / `benchmarked` / `estimated`), a _Not confirmed by you_ marker, the one-line basis, and the escape hatch **"I'll give the real number"** which returns to `exact`. `estimateBasis` is not optional in practice — a number without its reasoning is the thing this component exists to prevent.

Set `estimateLoading` while the estimate is being worked out; the other two modes never wait on it.
