/* The design-system primitives (LYR-180) plus the four ROI-specific ones the
   design system didn't ship (LYR-181). Import from here, not from the group
   folders — P11: a new component that duplicates one of these is a bug.
   If a screen needs something that almost fits, extend the primitive. */

export { Badge } from './core/Badge'
export { Button } from './core/Button'
export { Card } from './core/Card'
export { GlassPanel } from './core/GlassPanel'
export { Icon } from './core/Icon'
export { IconButton } from './core/IconButton'
export { Tag } from './core/Tag'

export { Checkbox } from './forms/Checkbox'
export { Input } from './forms/Input'
export { Radio } from './forms/Radio'
export { Select } from './forms/Select'
export { Switch } from './forms/Switch'

export { Dialog } from './feedback/Dialog'
export { Toast } from './feedback/Toast'
export { Tooltip } from './feedback/Tooltip'

export { Tabs } from './navigation/Tabs'

// ROI-specific. These carry the product's core ideas, not just its look —
// read the .prompt.md next to each before changing how one behaves.
export { ProvenanceMark } from './roi/ProvenanceMark'
export { ScanFactRow } from './roi/ScanFactRow'
export { SegmentedInput } from './roi/SegmentedInput'
export { SuggestionBlock } from './roi/SuggestionBlock'
