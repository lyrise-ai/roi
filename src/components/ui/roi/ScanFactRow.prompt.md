One verified fact from the company scan, with its source always visible. Stack them in the scan panel.

```jsx
<ScanFactRow fact="Team size" value="38 people" source="linkedin.com" sourceUrl="https://linkedin.com/..." />
<ScanFactRow fact="Pricing model" value="Per seat, monthly" source="lyrise.ai/pricing" />
<ScanFactRow fact="Support hours" value="Not found" verified={false} last />
```

Hairline between rows, no card per fact, so eight facts read as a list rather than eight boxes. `verified={false}` swaps the tick for a hollow ring and mutes the value: found the field, not the answer.

Set `last` on the final row to drop its hairline.

The tick is the `Icon` primitive (`name="check"`), not the literal ✓ the design system's preview harness uses.
