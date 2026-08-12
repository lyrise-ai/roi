Pill-shaped action control — the default CTA everywhere in LyRise product and marketing UI.

```jsx
<Button variant="primary" size="lg">
  Get Your ROI Breakdown
</Button>
```

Give it `href` when it navigates rather than acts — it renders an `<a>` in identical chrome, so middle-click and open-in-new-tab keep working:

```jsx
<Button as={Link} href="/dashboard">
  Back to my Profit Maps
</Button>
```

Use `as={Link}` for a route inside the app and a bare `href` for anything external.

Variants: `primary` (LyRise Purple, purple glow shadow), `secondary` (purple outline), `ghost`, `inverse` (white on dark/purple sections), `glass` (Brand Manual glass fill, for use over photography and reflection backgrounds). Sizes `sm | md | lg`. Hover darkens to `--purple-700`; press scales to `--press-scale`.
