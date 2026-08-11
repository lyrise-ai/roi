/* Scratch reference page for the design-system primitives (LYR-180) and the
   four ROI-specific ones (LYR-181). Every primitive in every variant, rendered
   on the installed token layer — it exists to catch token gaps and to be
   looked at, not to ship. Delete it (and nothing else) once the v2 screens are
   built. 404s in production. */
import * as React from 'react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  GlassPanel,
  Icon,
  IconButton,
  Input,
  ProvenanceMark,
  Radio,
  ScanFactRow,
  SegmentedInput,
  Select,
  SuggestionBlock,
  Switch,
  Tabs,
  Tag,
  Toast,
  Tooltip,
} from '@components/ui'

export function getStaticProps() {
  return { notFound: process.env.NEXT_PUBLIC_ENV === 'production', props: {} }
}

const Section = ({ title, children }) => (
  <section
    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
  >
    <h2
      style={{
        font: 'var(--type-h3)',
        color: 'var(--text-heading)',
        margin: 0,
      }}
    >
      {title}
    </h2>
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-5)',
      }}
    >
      {children}
    </div>
  </section>
)

const Row = ({ label, children, align = 'center' }) => (
  <div
    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}
  >
    <span
      style={{
        font: 'var(--type-eyebrow)',
        letterSpacing: 'var(--tracking-caps)',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}
    >
      {label}
    </span>
    <div
      style={{
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: align,
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  </div>
)

export default function UiKit() {
  const [dialog, setDialog] = React.useState(false)
  const [checked, setChecked] = React.useState(true)
  const [radio, setRadio] = React.useState('a')
  const [on, setOn] = React.useState(true)
  const [tab, setTab] = React.useState('one')
  // Deliberately no mode — the first control proves `exact` is the default
  // rather than being told to select it.
  const [pay, setPay] = React.useState({})
  const [hours, setHours] = React.useState({ mode: 'range' })
  const [seats, setSeats] = React.useState({ mode: 'estimate' })
  const tabs = [
    { value: 'one', label: 'Workflows' },
    { value: 'two', label: 'Assumptions' },
    { value: 'three', label: 'Sources' },
  ]

  return (
    <main
      style={{
        background: 'var(--surface-subtle)',
        minHeight: '100vh',
        padding: 'var(--space-12) var(--gutter)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--container-max)',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-12)',
        }}
      >
        <header
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <h1
            style={{
              font: 'var(--type-h1)',
              color: 'var(--text-heading)',
              margin: 0,
            }}
          >
            Design system primitives
          </h1>
          <p
            style={{
              font: 'var(--type-body)',
              color: 'var(--text-muted)',
              margin: 0,
            }}
          >
            Scratch reference. Every primitive in every variant, on the
            installed tokens.
          </p>
        </header>

        <Section title="Button">
          <Row label="Variants">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <div
              style={{
                background: 'var(--dark-blue)',
                padding: 12,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Button variant="inverse">Inverse</Button>
            </div>
            <div
              style={{
                background: 'var(--bg-deep)',
                backgroundImage: 'var(--bg-reflections),var(--bg-deep)',
                padding: 12,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <Button variant="glass">Glass</Button>
            </div>
          </Row>
          <Row label="Sizes">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </Row>
          <Row label="Icons, loading, disabled, full width">
            <Button iconLeft={<Icon name="workflow" size={18} />}>
              Icon left
            </Button>
            <Button iconRight={<Icon name="arrow-right" size={18} />}>
              Icon right
            </Button>
            <Button
              variant="secondary"
              iconLeft={<Icon name="loader" size={18} />}
            >
              Loading
            </Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </Row>
          <Row label="Full width">
            <div style={{ width: 360 }}>
              <Button
                fullWidth
                iconRight={<Icon name="arrow-right" size={18} />}
              >
                Get your ROI breakdown
              </Button>
            </div>
          </Row>
        </Section>

        <Section title="IconButton">
          <Row label="Variants and sizes">
            <IconButton label="Ghost">
              <Icon name="more-horizontal" size={18} />
            </IconButton>
            <IconButton label="Outline" variant="outline">
              <Icon name="pencil" size={18} />
            </IconButton>
            <IconButton label="Solid" variant="solid">
              <Icon name="play" size={18} />
            </IconButton>
            <IconButton label="Small" variant="outline" size="sm">
              <Icon name="plus" size={16} />
            </IconButton>
            <IconButton label="Large" variant="outline" size="lg">
              <Icon name="plus" size={22} />
            </IconButton>
            <IconButton label="Disabled" variant="solid" disabled>
              <Icon name="trash-2" size={18} />
            </IconButton>
          </Row>
        </Section>

        <Section title="Icon">
          <Row label="Lucide, kebab names, 2px stroke">
            {[
              'workflow',
              'arrow-right',
              'check',
              'search',
              'bar-chart-3',
              'wand-2',
              'alert-circle',
              'clock',
            ].map((n) => (
              <span
                key={n}
                style={{
                  display: 'inline-flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                  width: 110,
                  color: 'var(--text-body)',
                }}
              >
                <Icon name={n} size={24} />
                <code
                  style={{
                    font: '400 11px/1 var(--font-mono)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {n}
                </code>
              </span>
            ))}
          </Row>
          <Row label="Sizes and colour">
            <Icon name="wand-2" size={16} />
            <Icon name="wand-2" size={24} />
            <Icon name="wand-2" size={32} />
            <Icon name="wand-2" size={32} color="var(--lyrise-purple)" />
            <Icon name="wand-2" size={32} strokeWidth={1} color="var(--grow)" />
          </Row>
        </Section>

        <Section title="Card">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4,1fr)',
              gap: 'var(--space-4)',
            }}
          >
            {['default', 'subtle', 'accent', 'inverse'].map((tone) => (
              <Card key={tone} tone={tone} interactive>
                <h3 style={{ font: 'var(--type-h3)', margin: '0 0 6px' }}>
                  {tone}
                </h3>
                <p
                  style={{ font: 'var(--type-body)', margin: 0, opacity: 0.8 }}
                >
                  Interactive — lifts on hover.
                </p>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="GlassPanel">
          <div
            style={{
              background: 'var(--bg-deep)',
              backgroundImage: 'var(--bg-reflections),var(--bg-deep)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--space-8)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 'var(--space-6)',
            }}
          >
            <GlassPanel>
              <div
                style={{
                  font: 'var(--type-eyebrow)',
                  letterSpacing: 'var(--tracking-caps)',
                  textTransform: 'uppercase',
                  opacity: 0.7,
                }}
              >
                Light
              </div>
              <div
                style={{
                  font: 'var(--weight-extrabold) var(--text-3xl)/1 var(--font-display)',
                }}
              >
                4.2x
              </div>
            </GlassPanel>
            <GlassPanel tone="dark">
              <div
                style={{
                  font: 'var(--type-eyebrow)',
                  letterSpacing: 'var(--tracking-caps)',
                  textTransform: 'uppercase',
                  opacity: 0.7,
                }}
              >
                Dark
              </div>
              <div
                style={{
                  font: 'var(--weight-extrabold) var(--text-3xl)/1 var(--font-display)',
                  color: '#fff',
                }}
              >
                $1.8M
              </div>
            </GlassPanel>
            <GlassPanel blur={false} padding="var(--space-4)">
              <span style={{ font: 'var(--type-label)' }}>
                blur={'{false}'}
              </span>
            </GlassPanel>
            <GlassPanel tone="dark" blur={false} padding="var(--space-4)">
              <span style={{ font: 'var(--type-label)', color: '#fff' }}>
                dark, no blur
              </span>
            </GlassPanel>
          </div>
        </Section>

        <Section title="Badge and Tag">
          <Row label="Badge tones">
            {['purple', 'grow', 'power', 'sunny', 'trust', 'neutral'].map(
              (tone) => (
                <Badge key={tone} tone={tone}>
                  {tone}
                </Badge>
              ),
            )}
          </Row>
          <Row label="Tags">
            <Tag>Finance</Tag>
            <Tag>Legal ops</Tag>
            <Tag removable onRemove={() => {}}>
              Removable
            </Tag>
          </Row>
        </Section>

        <Section title="Forms">
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3,1fr)',
              gap: 'var(--space-5)',
            }}
          >
            <Input
              label="Company"
              placeholder="acme.com"
              hint="Domain or name"
            />
            <Input
              label="Seats"
              placeholder="120"
              error="Must be a whole number"
            />
            <Input
              label="Search"
              placeholder="Filter workflows"
              iconLeft={<Icon name="search" size={16} />}
            />
            <Select
              label="Industry"
              hint="Drives the benchmark set"
              options={[
                { value: 'saas', label: 'SaaS' },
                { value: 'fin', label: 'Financial services' },
                { value: 'health', label: 'Healthcare' },
              ]}
            />
            <Input label="Disabled" placeholder="Read only" disabled />
            <Select
              label="Currency"
              options={[
                { value: 'usd', label: 'USD' },
                { value: 'egp', label: 'EGP' },
              ]}
            />
          </div>
          <Row label="Checkbox / Radio / Switch">
            <Checkbox
              label="Checked"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <Checkbox label="Unchecked" checked={false} onChange={() => {}} />
            <Checkbox label="Disabled" checked disabled onChange={() => {}} />
            <Radio
              label="Option A"
              name="demo"
              value="a"
              checked={radio === 'a'}
              onChange={() => setRadio('a')}
            />
            <Radio
              label="Option B"
              name="demo"
              value="b"
              checked={radio === 'b'}
              onChange={() => setRadio('b')}
            />
            <Radio
              label="Disabled"
              name="demo2"
              checked={false}
              disabled
              onChange={() => {}}
            />
            <Switch
              label="On"
              checked={on}
              onChange={(e) => setOn(e.target.checked)}
            />
            <Switch label="Off" checked={false} onChange={() => {}} />
            <Switch label="Disabled" checked disabled onChange={() => {}} />
          </Row>
        </Section>

        <Section title="Tabs">
          <Row label="Underline" align="stretch">
            <div style={{ width: '100%' }}>
              <Tabs tabs={tabs} value={tab} onChange={setTab} />
            </div>
          </Row>
          <Row label="Pill">
            <Tabs tabs={tabs} value={tab} onChange={setTab} variant="pill" />
          </Row>
        </Section>

        <Section title="Feedback">
          <Row label="Toast tones" align="flex-start">
            <Toast
              tone="info"
              title="Recalculating"
              message="Applying your new assumption to 12 workflows."
              onDismiss={() => {}}
            />
            <Toast
              tone="success"
              title="Report saved"
              message="Shareable link copied to your clipboard."
              onDismiss={() => {}}
            />
            <Toast
              tone="error"
              title="Research failed"
              message="We could not reach the company site."
              onDismiss={() => {}}
            />
          </Row>
          <Row label="Tooltip placements">
            {['top', 'bottom', 'left', 'right'].map((p) => (
              <Tooltip key={p} label={`Placement: ${p}`} placement={p}>
                <Button variant="secondary" size="sm">
                  {p}
                </Button>
              </Tooltip>
            ))}
          </Row>
          <Row label="Dialog">
            <Button onClick={() => setDialog(true)}>Open dialog</Button>
            <Dialog
              open={dialog}
              title="Discard these edits?"
              description="The model will revert to the last saved assumptions."
              onClose={() => setDialog(false)}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => setDialog(false)}>Discard</Button>
                </>
              }
            >
              <Card tone="subtle" padding="var(--space-4)">
                <span style={{ font: 'var(--type-body)' }}>
                  Children render between description and footer.
                </span>
              </Card>
            </Dialog>
          </Row>
        </Section>

        <Section title="SegmentedInput">
          <Row
            label="Exact is pre-selected — all three segments equal weight"
            align="stretch"
          >
            <div style={{ width: 460 }}>
              <SegmentedInput
                label="What one of these people costs you a year"
                prefix="$"
                placeholder="74,000"
                value={pay}
                onChange={setPay}
                estimate="$74,000"
                estimateSource="benchmarked"
                estimateBasis="Benchmarked against 40 operations teams of your size in your city."
              />
            </div>
          </Row>
          <Row
            label="Range mode, and the AI path with its escape hatch"
            align="stretch"
          >
            <div style={{ width: 460 }}>
              <SegmentedInput
                label="Hours a week spent on this"
                suffix="hours a week"
                value={hours}
                onChange={setHours}
                estimate="26 hours"
                estimateSource="estimated"
                estimateBasis="Estimated from the workflow you described and typical handling times."
                hint="Both ends are optional — one is enough to model a range."
              />
            </div>
            <div style={{ width: 460 }}>
              <SegmentedInput
                label="How many people do this"
                value={seats}
                onChange={setSeats}
                estimate="38 people"
                estimateSource="scraped"
                estimateBasis="Counted from your team page and LinkedIn on 4 August."
              />
            </div>
          </Row>
          <Row
            label="Estimate still being worked out — the other modes never wait on it"
            align="stretch"
          >
            <div style={{ width: 460 }}>
              <SegmentedInput
                label="Average deal size"
                prefix="$"
                value={{ mode: 'estimate' }}
                onChange={() => {}}
                estimateLoading
              />
            </div>
          </Row>
        </Section>

        <Section title="ProvenanceMark">
          <Row label="Dot, pill, and given (renders nothing)">
            {[
              { figure: '$412,000', kind: 'benchmarked', variant: 'dot' },
              { figure: '38 people', kind: 'scraped', variant: 'pill' },
              { figure: '26 hours', kind: 'estimated', variant: 'dot' },
              { figure: '$96,400', kind: 'given', variant: 'dot' },
            ].map((f) => (
              <span
                key={f.figure}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  font: 'var(--weight-extrabold) var(--text-xl)/1 var(--font-display)',
                  letterSpacing: 'var(--tracking-tight)',
                  color: 'var(--text-heading)',
                  marginRight: 'var(--space-5)',
                }}
              >
                {f.figure}
                <ProvenanceMark
                  kind={f.kind}
                  variant={f.variant}
                  onClick={() => {}}
                />
              </span>
            ))}
          </Row>
        </Section>

        <Section title="SuggestionBlock">
          <Row
            label="Resolved, looking, and nothing found (renders nothing)"
            align="stretch"
          >
            <div style={{ width: 340 }}>
              <SuggestionBlock
                label="From your website"
                suggestion="You run outbound sales for mid-market logistics firms."
                source="lyrise.ai/about"
                sourceUrl="https://www.lyrise.ai/about"
                onUse={() => {}}
                onDismiss={() => {}}
              />
            </div>
            <div style={{ width: 340 }}>
              <SuggestionBlock state="loading" label="From your website" />
            </div>
            <div style={{ width: 340 }}>
              <SuggestionBlock state="empty" />
              <SuggestionBlock state="failed" />
              <span
                style={{
                  font: 'var(--weight-regular) var(--text-xs)/1.4 var(--font-body)',
                  color: 'var(--text-muted)',
                }}
              >
                empty and failed render nothing — this column is deliberately
                blank.
              </span>
            </div>
          </Row>
        </Section>

        <Section title="ScanFactRow">
          <Row label="Stacked into a scan panel" align="stretch">
            <Card style={{ width: '100%' }}>
              <ScanFactRow
                fact="Team size"
                value="38 people"
                source="linkedin.com"
                sourceUrl="https://www.linkedin.com/"
              />
              <ScanFactRow
                fact="What you sell"
                value="Freight brokerage software, per seat"
                source="lyrise.ai/pricing"
              />
              <ScanFactRow
                fact="Founded"
                value="2019, Cairo"
                source="crunchbase.com"
              />
              <ScanFactRow
                fact="Support hours"
                value="Not found"
                verified={false}
                last
              />
            </Card>
          </Row>
        </Section>
      </div>
    </main>
  )
}
