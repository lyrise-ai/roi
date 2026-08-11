/* POC of the redesigned Profit Map (LYR-178, scaffold: LYR-182).

   Parallel route, deliberately. Everything under /v2 is isolated from the live
   alpha: no auth, no alpha cap, no `reports`/`state_data`, no SSE, and nothing
   imported from `src/lib/roi/`. The live app must behave identically with this
   directory deleted — which is also how it gets thrown away later.

   The token layer needs no import here: `styles/global.css` is loaded once in
   `pages/_app.js`, so every CSS custom property the primitives read is already
   on the document. `Shell` below is this route's own layout — the alpha's
   chrome is not reused.

   Flow state is a single object in this component and lives in memory only.
   A refresh starts over; that's the accepted trade for a supervised demo
   (LYR-182: "state can live in memory"). The screens are stubs — LYR-183+
   replace their bodies, not the flow around them. */
import * as React from 'react'
import Head from 'next/head'
import { Button, Card, Input, SegmentedInput } from '@components/ui'

const STEPS = ['landing', 'company', 'interview', 'reveal']

function Shell({ step, onBack, children }) {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'var(--surface-page)',
        padding: 'var(--space-8) var(--space-5)',
      }}
    >
      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
          }}
        >
          <span
            style={{ font: 'var(--type-label)', color: 'var(--text-muted)' }}
          >
            {`Step ${STEPS.indexOf(step) + 1} of ${STEPS.length} · ${step}`}
          </span>
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              Back
            </Button>
          )}
        </header>
        {children}
      </div>
    </main>
  )
}

function Landing({ onNext }) {
  return (
    <Card>
      <h1 style={{ font: 'var(--type-h1)', color: 'var(--text-heading)' }}>
        Find the profit hiding in your operations
      </h1>
      <p
        style={{
          font: 'var(--type-body)',
          color: 'var(--text-muted)',
          margin: 'var(--space-4) 0 var(--space-6)',
        }}
      >
        Ten minutes, your real numbers, one business case.
      </p>
      <Button onClick={onNext}>Start</Button>
    </Card>
  )
}

function Company({ value, onChange, onNext }) {
  return (
    <Card>
      <Input
        label="Company website"
        placeholder="acme.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Button onClick={onNext} disabled={!value.trim()}>
          Scan
        </Button>
      </div>
    </Card>
  )
}

function Interview({ value, onChange, onNext }) {
  return (
    <Card>
      <SegmentedInput
        label="How many hours a week does your team spend on this?"
        suffix="hours a week"
        placeholder="0"
        value={value}
        onChange={onChange}
      />
      <div style={{ marginTop: 'var(--space-6)' }}>
        <Button onClick={onNext}>See the number</Button>
      </div>
    </Card>
  )
}

function Reveal({ flow, onRestart }) {
  return (
    <Card>
      <h2 style={{ font: 'var(--type-h2)', color: 'var(--text-heading)' }}>
        {flow.company || 'Your company'}
      </h2>
      <p
        style={{
          font: 'var(--type-body)',
          color: 'var(--text-muted)',
          margin: 'var(--space-4) 0 var(--space-6)',
        }}
      >
        {`Hours a week: ${flow.hours.exact || flow.hours.low || '—'}`}
      </p>
      <Button variant="secondary" onClick={onRestart}>
        Start over
      </Button>
    </Card>
  )
}

export default function V2() {
  const [flow, setFlow] = React.useState({
    step: 'landing',
    company: '',
    hours: {},
  })

  const go = (delta) =>
    setFlow((f) => ({
      ...f,
      step: STEPS[Math.min(Math.max(STEPS.indexOf(f.step) + delta, 0), 3)],
    }))
  const patch = (fields) => setFlow((f) => ({ ...f, ...fields }))

  return (
    <>
      <Head>
        <title>Profit Map</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Shell
        step={flow.step}
        onBack={flow.step === 'landing' ? null : () => go(-1)}
      >
        {flow.step === 'landing' && <Landing onNext={() => go(1)} />}
        {flow.step === 'company' && (
          <Company
            value={flow.company}
            onChange={(company) => patch({ company })}
            onNext={() => go(1)}
          />
        )}
        {flow.step === 'interview' && (
          <Interview
            value={flow.hours}
            onChange={(hours) => patch({ hours })}
            onNext={() => go(1)}
          />
        )}
        {flow.step === 'reveal' && (
          <Reveal
            flow={flow}
            onRestart={() =>
              setFlow({ step: 'landing', company: '', hours: {} })
            }
          />
        )}
      </Shell>
    </>
  )
}
