/* The design-system primitives (LYR-180) plus the four ROI-specific ones the
   design system didn't ship (LYR-181). Import from here, not from the group
   folders — P11: a new component that duplicates one of these is a bug.
   If a screen needs something that almost fits, extend the primitive. */

export { Badge } from '@/src/ui/core/Badge'
export { Button } from '@/src/ui/core/Button'
export { Card } from '@/src/ui/core/Card'
export { GlassPanel } from '@/src/ui/core/GlassPanel'
export { Icon } from '@/src/ui/core/Icon'
export { IconButton } from '@/src/ui/core/IconButton'
export { Tag } from '@/src/ui/core/Tag'

export { Checkbox } from '@/src/ui/forms/Checkbox'
export { Input } from '@/src/ui/forms/Input'
export { Radio } from '@/src/ui/forms/Radio'
export { Select } from '@/src/ui/forms/Select'
export { Switch } from '@/src/ui/forms/Switch'

export { Dialog } from '@/src/ui/feedback/Dialog'
export { Toast } from '@/src/ui/feedback/Toast'
export { Tooltip } from '@/src/ui/feedback/Tooltip'

export { Tabs } from '@/src/ui/navigation/Tabs'

// ROI-specific. These carry the product's core ideas, not just its look —
// read the comment at the top of each before changing how one behaves.
export { ProvenanceMark } from '@/src/ui/roi/ProvenanceMark'
export { ScanFactRow } from '@/src/ui/roi/ScanFactRow'
export { SegmentedInput } from '@/src/ui/roi/SegmentedInput'
export { SuggestionBlock } from '@/src/ui/roi/SuggestionBlock'

export { ChatPanel } from '@/src/ui/report/ChatPanel'
