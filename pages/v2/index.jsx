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
   (LYR-182: "state can live in memory"). Landing and company are built
   (LYR-183); interview and reveal are still stubs.

   Sizes here are tokens or relative units — no raw px (P10). Inline styles
   can't carry media queries, so everything responsive comes from `clamp()`,
   `ch` max-widths and wrapping flex rows instead. */
import * as React from 'react'
import Head from 'next/head'
import Image from 'next/image'
import Logo from '@/src/assets/logo.svg'
import { Button, Icon, Input, SegmentedInput } from '@components/ui'

const STEPS = ['landing', 'company', 'interview', 'reveal']

/* The two headline sizes the design uses sit between the type-scale roles:
   --type-h1 (48px) is too big on a phone and --type-h2 too big for a question.
   Both interpolate between existing size tokens rather than naming new ones. */
const HEADLINE = {
  font: 'var(--weight-extrabold) clamp(var(--text-2xl), 6vw, var(--text-4xl))/var(--leading-snug) var(--font-display)',
  letterSpacing: 'var(--tracking-tight)',
  textWrap: 'pretty',
}
const QUESTION = {
  font: 'var(--weight-extrabold) clamp(var(--text-lg), 4vw, var(--text-2xl))/var(--leading-snug) var(--font-display)',
  letterSpacing: 'var(--tracking-tight)',
  textWrap: 'pretty',
}
const LEAD = {
  font: 'var(--type-body)',
  color: 'var(--neutral-600)',
  textWrap: 'pretty',
}

/* The design's entrance: each screen rises 8px as it mounts. It lives here
   rather than in styles/global.css so /v2 stays deletable as one directory,
   and in a class rather than an inline style so the reduced-motion query can
   actually override it. */
const RISE_CSS = `
  .v2-rise { animation: v2-rise var(--duration-slow) var(--ease-out); }
  @keyframes v2-rise {
    from { opacity: 0; transform: translateY(var(--space-2)); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .v2-rise { animation: none; }
  }
`

function Shell({ step, children }) {
  const index = STEPS.indexOf(step)
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-subtle)',
        color: 'var(--text-heading)',
      }}
    >
      <header
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          padding: 'var(--space-5) var(--space-6)',
        }}
      >
        {/* 70x24 is the asset's own 138:47 ratio at --space-6 tall. Sized by
            attribute rather than CSS: next/image warns when a rendered
            dimension disagrees with the one it was given. */}
        <Image src={Logo} alt="LyRise" width={70} height={24} priority />
        {/* No progress on the landing screen — there is no flow to be in yet. */}
        {index > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            <div
              style={{
                width: 'var(--space-20)',
                height: 'var(--space-1)',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--neutral-100)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${((index + 1) / STEPS.length) * 100}%`,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--dark-blue)',
                  transition: 'width var(--duration-base) var(--ease-out)',
                }}
              />
            </div>
            <span
              style={{
                font: 'var(--weight-regular) var(--text-xs)/var(--leading-normal) var(--font-body)',
                color: 'var(--text-muted)',
              }}
            >
              {`Step ${index + 1} of ${STEPS.length}`}
            </span>
          </div>
        )}
      </header>
      {children}
    </main>
  )
}

/* The analyst is a presence, not a mascot: a dot, a name, nothing animated. */
function AnalystMark() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        marginBottom: 'var(--space-5)',
      }}
    >
      <span
        style={{
          width: 'var(--space-6)',
          height: 'var(--space-6)',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-accent-subtle)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            width: 'var(--space-2)',
            height: 'var(--space-2)',
            borderRadius: 'var(--radius-pill)',
            background: 'var(--lyrise-purple)',
          }}
        />
      </span>
      <span
        style={{
          font: 'var(--weight-regular) var(--text-sm)/var(--leading-normal) var(--font-body)',
          color: 'var(--text-muted)',
        }}
      >
        LyRise analyst
      </span>
    </div>
  )
}

/* One line, one CTA, three chips. No splash, no typewriter, no auto-advance —
   the restraint is the design (LYR-183). */
function Landing({ onStart }) {
  const chips = ['~3 minutes', 'Free, no sales call', 'Your numbers stay yours']
  return (
    <section
      className="v2-rise"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: 'var(--space-10) var(--space-6) var(--space-20)',
      }}
    >
      <h1 style={{ ...HEADLINE, maxWidth: '30ch' }}>
        Tell us how your teams actually work.{' '}
        <span style={{ color: 'var(--text-muted)' }}>
          We&rsquo;ll show you where AI can save you real hours and money.
        </span>
      </h1>
      <p
        style={{
          ...LEAD,
          maxWidth: '52ch',
          margin: 'var(--space-6) 0 var(--space-10)',
        }}
      >
        A short, honest conversation about your business. At the end, a straight
        answer: here&rsquo;s what this work costs you, and here&rsquo;s
        what&rsquo;s worth automating.
      </p>
      <Button
        size="lg"
        onClick={onStart}
        iconRight={<Icon name="arrow-right" size={18} />}
      >
        Start with my company
      </Button>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 'var(--space-3)',
          marginTop: 'var(--space-8)',
          font: 'var(--weight-regular) var(--text-sm)/var(--leading-normal) var(--font-body)',
          color: 'var(--text-muted)',
        }}
      >
        {/* The separator travels with the chip that follows it, so a wrap on a
            narrow screen never strands a dot at the end of a line. */}
        {chips.map((chip, i) => (
          <span
            key={chip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
            }}
          >
            {i > 0 && (
              <span
                aria-hidden="true"
                style={{
                  width: 'var(--space-1)',
                  height: 'var(--space-1)',
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--neutral-300)',
                }}
              />
            )}
            {chip}
          </span>
        ))}
      </div>
    </section>
  )
}

/* Two fields, then straight into the interview. Submitting starts the scan but
   never waits for it — see `startScan`. */
function Company({ value, onChange, onBack, onSubmit }) {
  const submit = (e) => {
    e.preventDefault()
    if (value.name.trim()) onSubmit()
  }
  return (
    <section
      className="v2-rise"
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 'var(--container-narrow)',
        margin: '0 auto',
        padding: 'var(--space-8) var(--space-6) var(--space-20)',
      }}
    >
      <AnalystMark />
      <h2 style={QUESTION}>
        First — what&rsquo;s your company, and where can I find you online?
      </h2>
      <p style={{ ...LEAD, margin: 'var(--space-3) 0 var(--space-8)' }}>
        I&rsquo;ll read up on you while you answer the questions that matter, so
        nothing I ask is something I could have looked up myself.
      </p>

      <form onSubmit={submit}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-5)',
          }}
        >
          <Input
            label="Company name"
            placeholder="e.g. Harbourfield Legal"
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <Input
            label="Website"
            placeholder="harbourfield.com"
            value={value.website}
            onChange={(e) => onChange({ website: e.target.value })}
          />
        </div>

        <p
          style={{
            font: 'var(--weight-regular) var(--text-xs)/var(--leading-relaxed) var(--font-body)',
            color: 'var(--neutral-400)',
            marginTop: 'var(--space-5)',
          }}
        >
          While we talk, I&rsquo;ll note what I can verify about you — with
          sources — in a panel beside the questions. It never gets ahead of what
          you tell me.
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-4)',
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 'var(--space-6)',
            marginTop: 'var(--space-8)',
          }}
        >
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
          <Button
            type="submit"
            disabled={!value.name.trim()}
            iconRight={<Icon name="arrow-right" size={18} />}
          >
            Next
          </Button>
        </div>
      </form>
    </section>
  )
}

function Interview({ value, onChange, onBack, onNext }) {
  return (
    <section
      className="v2-rise"
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 'var(--container-narrow)',
        margin: '0 auto',
        padding: 'var(--space-8) var(--space-6) var(--space-20)',
      }}
    >
      <SegmentedInput
        label="How many hours a week does your team spend on this?"
        suffix="hours a week"
        placeholder="0"
        value={value}
        onChange={onChange}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          marginTop: 'var(--space-6)',
        }}
      >
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>See the number</Button>
      </div>
    </section>
  )
}

function Reveal({ flow, onRestart }) {
  return (
    <section
      className="v2-rise"
      style={{
        flex: 1,
        width: '100%',
        maxWidth: 'var(--container-narrow)',
        margin: '0 auto',
        padding: 'var(--space-8) var(--space-6) var(--space-20)',
      }}
    >
      <h2 style={QUESTION}>{flow.company.name || 'Your company'}</h2>
      <p style={{ ...LEAD, margin: 'var(--space-4) 0 var(--space-6)' }}>
        {`Hours a week: ${flow.hours.exact || flow.hours.low || '—'}`}
      </p>
      <Button variant="secondary" onClick={onRestart}>
        Start over
      </Button>
    </section>
  )
}

const emptyFlow = () => ({
  step: 'landing',
  company: { name: '', website: '' },
  scan: { status: 'idle' },
  hours: {},
})

/* The scan is canned in the POC (LYR-178) and is fired, never awaited: the
   company form advances on the same tick and the result lands whenever it
   lands. Only the status is modelled here — the facts and the panel that
   renders them belong to the scan-panel card. */
function startScan(setFlow) {
  setTimeout(
    () => setFlow((f) => ({ ...f, scan: { status: 'ready' } })),
    2000, // stands in for a research call; nothing downstream blocks on it
  )
}

export default function V2() {
  const [flow, setFlow] = React.useState(emptyFlow)

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
        <style>{RISE_CSS}</style>
      </Head>
      <Shell step={flow.step}>
        {flow.step === 'landing' && <Landing onStart={() => go(1)} />}
        {flow.step === 'company' && (
          <Company
            value={flow.company}
            onChange={(fields) =>
              patch({ company: { ...flow.company, ...fields } })
            }
            onBack={() => go(-1)}
            onSubmit={() => {
              patch({ step: 'interview', scan: { status: 'scanning' } })
              startScan(setFlow)
            }}
          />
        )}
        {flow.step === 'interview' && (
          <Interview
            value={flow.hours}
            onChange={(hours) => patch({ hours })}
            onBack={() => go(-1)}
            onNext={() => go(1)}
          />
        )}
        {flow.step === 'reveal' && (
          <Reveal flow={flow} onRestart={() => setFlow(emptyFlow)} />
        )}
      </Shell>
    </>
  )
}
