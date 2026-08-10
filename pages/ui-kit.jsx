/* Scratch reference page for the design-system primitives (LYR-180).
   Every primitive in every variant, rendered on the installed token layer —
   it exists to catch token gaps and to be looked at, not to ship. Delete it
   (and nothing else) once the v2 screens are built. 404s in production. */
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
  Radio,
  Select,
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
      </div>
    </main>
  )
}
