Glass container — LyRise's core "transparency" motif. Use over photography, gradients, or the Shining Reflections background; never on flat white (the effect disappears).

```jsx
<div style={{ background: 'var(--bg-deep), var(--bg-reflections)' }}>
  <GlassPanel tone="dark">
    <h3>ROI 4x</h3>
  </GlassPanel>
</div>
```

Exact recipe is in `--glass-fill`, `--glass-border`, `--glass-blur`, `--shadow-glass`. Radius is 24px (`--radius-glass`).
