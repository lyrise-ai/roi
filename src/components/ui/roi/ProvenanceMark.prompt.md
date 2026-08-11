A small purple mark after a number, meaning this includes assumptions — click to see which.

```jsx
<span>$412,000<ProvenanceMark kind="benchmarked" onClick={openTrace} /></span>
<span>38 people<ProvenanceMark kind="scraped" variant="pill" onClick={openTrace} /></span>
```

**Absence is the clean state.** A value the user typed gets no mark — `kind="given"` renders `null`, so you can bind the prop straight to your data without branching. Marks stay rare enough to mean something.

**Not a dashed underline.** In the report a dashed underline already means "click for the calculation"; this is a different question — where did the input come from. `dot` beside display figures, `pill` where the kind itself needs reading.

All three kinds are purple. This is traceability, not a warning, so no kind gets amber or red; the word carries the difference.
