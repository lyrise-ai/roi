The dashed block offering a research-derived suggestion beside the user's own input.

```jsx
<SuggestionBlock
  state={scan.state}
  label="From your website"
  suggestion="You run outbound sales for mid-market logistics firms."
  source="lyrise.ai/about"
  sourceUrl="https://www.lyrise.ai/about"
  onUse={accept}
  onDismiss={reject}
/>
```

Dashed border, no fill, no shadow, small type: it stays visibly junior to the field it sits next to.

Three states. `resolved` renders the suggestion. `loading` shows a quiet _Looking…_ on the block alone and never disables the field beside it — the user can always just type the answer. `empty` and `failed` render `null`; an empty dashed box reads as broken.
