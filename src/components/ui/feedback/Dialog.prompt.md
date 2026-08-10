Modal for confirmations and short forms (booking a consultation, confirming an agent run).

```jsx
<Dialog
  open={open}
  title="Book your consultation"
  onClose={close}
  footer={
    <>
      <Button variant="ghost" onClick={close}>
        Cancel
      </Button>
      <Button>Confirm</Button>
    </>
  }
>
  <Input label="Work email" />
</Dialog>
```

Scrim is `rgba(0,0,34,.55)` + 6px blur — the dark-blue brand colour, never neutral black.
