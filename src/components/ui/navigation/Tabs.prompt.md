Switches between sibling views without navigating.

```jsx
<Tabs
  variant="pill"
  tabs={[
    { value: 'map', label: 'Process map' },
    { value: 'roi', label: 'ROI' },
  ]}
  value={v}
  onChange={setV}
/>
```

Active underline tab is purple with a 2px inset rule; active pill is a white card on the neutral track.
