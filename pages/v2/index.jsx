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
   (LYR-183), the interview is built (LYR-184); the reveal is still a stub.

   The interview does not add a step: `flow.turn` walks the pain points inside
   the `interview` step, and every answer for every pain point stays in
   `flow.pains` for the whole session. That is what makes going back cheap and
   what hands the calculator the full set at the end.

   Sizes here are tokens or relative units — no raw px (P10). Inline styles
   can't carry media queries, so everything responsive comes from `clamp()`,
   `ch` max-widths and wrapping flex rows instead. */
import * as React from 'react'
import Head from 'next/head'
import Image from 'next/image'
import Logo from '@/src/assets/logo.svg'
import {
  Button,
  Icon,
  Input,
  ProvenanceMark,
  ScanFactRow,
  SegmentedInput,
  SuggestionBlock,
} from '@components/ui'

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
  .v2-pulse { animation: v2-pulse 1.2s var(--ease-out) infinite; }
  @keyframes v2-pulse {
    0%, 100% { opacity: 0.35; }
    50% { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .v2-rise, .v2-pulse { animation: none; }
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

/* Everything below is canned demo copy for one prospect (LYR-178: the scan is
   not live in the POC). It is data, not logic — swapping the client means
   swapping these arrays and nothing else.

   Read the question strings aloud before editing one. The rule the whole
   screen is built on is that none of them may contain "percent",
   "automatable", "headcount", "volume", "FTE" or "blended rate" (LYR-184). */
const PAINS = [
  {
    question:
      'Where do your teams lose the most time each week — the stuff that’s repetitive but somehow still eats hours?',
    sub: 'Tell me in your own words. The more specific, the sharper your numbers get.',
    placeholder:
      'e.g. our paralegals re-key client intake forms into three different systems by hand',
    guess:
      'Contract review and client reporting look manual for a firm your size.',
    guessKind: 'estimated',
    guessWhy:
      'Your site lists commercial, property and employment work with fixed-fee pricing, and neither open role mentions a document system — so we’d expect review to be done by hand. That’s a read, not a fact.',
    quantIntro: 'Once you name it, a few quick things about that work:',
  },
  {
    question:
      'What’s the second one? Something else that drains a team the same way.',
    sub: 'A different team is fine — often it’s a different one entirely.',
    placeholder:
      'e.g. someone rebuilds the same client status report by hand every Friday',
    guess: 'Monthly billing prep looks like it’s assembled by hand.',
    guessKind: 'benchmarked',
    guessWhy:
      'Fixed-fee firms your size usually assemble billing from timesheets manually each month. Nothing on your site says otherwise, but nothing confirms it either.',
    quantIntro: 'Same questions for this one:',
  },
  {
    question: 'And a third. The third one usually surprises people.',
    sub: 'The third one is where I start seeing the pattern rather than the incident.',
    placeholder: 'e.g. two people chase missing documents over email all week',
    guess:
      'Chasing missing documents looks like email work someone does by hand.',
    guessKind: 'scraped',
    guessWhy:
      'Both of your open roles ask for chasing outstanding client paperwork — that’s from your own careers page.',
    quantIntro: 'Last set:',
  },
]

/* The pushback the card asks for at four and beyond. It is copy, not a block:
   the button still works, the analyst just says what it thinks. */
const EXTRA_PAIN = {
  question: 'Another one, then.',
  sub: 'Worth adding only if it’s genuinely bleeding — I’d rather model three well than six loosely.',
  placeholder:
    'e.g. onboarding a new client takes a week of copy-paste across systems',
  guess: '',
  quantIntro: 'Same questions:',
}

const painAt = (i) => PAINS[i] || EXTRA_PAIN

/* The five number questions, asked the same way for every pain point.
   The last one becomes `automatable%` downstream — it is the single largest
   guess in the whole model, which is why it is asked rather than assumed. */
const QUANT = [
  {
    label: 'How many times does this happen, start to finish, in a month?',
    placeholder: '200 client intakes',
    estimate: 'about 200 a month',
    kind: 'benchmarked',
    why: 'A firm of 42 taking on commercial, property and employment work typically opens around 200 matters a month. This one matters — it multiplies everything below it.',
  },
  {
    label: 'How many people do it?',
    placeholder: '4',
    estimate: 'about 4 people',
    kind: 'scraped',
    why: 'Your team page (harbourfield.com/team) lists four paralegals under operations.',
  },
  {
    label: 'Hours a week, each?',
    placeholder: '12',
    estimate: 'about 12 hours',
    kind: 'benchmarked',
    why: 'The middle of what firms of 40–60 people report for this kind of work — not your number.',
  },
  {
    label: 'Roughly what they earn?',
    placeholder: '$70k a year',
    estimate: 'about $72k a year',
    kind: 'benchmarked',
    why: 'Regional pay data for paralegals at firms your size.',
  },
  {
    label:
      'If a system did the repetitive part, how much would still need a person?',
    placeholder: 'about a third',
    estimate: 'about a third',
    kind: 'estimated',
    why: 'Our read: re-keying follows rules, but conflict checks and odd cases still need judgment. Nothing scraped — correct it freely.',
  },
]

const SCAN = [
  { fact: 'Team size', value: '42 people', source: 'harbourfield.com/team' },
  {
    fact: 'Practice areas',
    value: 'Commercial, property, employment',
    source: 'harbourfield.com',
  },
  {
    fact: 'Pricing model',
    value: 'Fixed fee, published openly',
    source: 'harbourfield.com/pricing',
  },
  {
    fact: 'Hiring now',
    value: 'Two roles, both mention document review',
    source: 'careers page',
  },
]
const SCAN_LOOKING = [
  'Reading your site…',
  'Checking your team page…',
  'Reading your pricing page…',
  'Checking recent job postings…',
]

/* Two is the floor for a report that holds up; the copy says why rather than
   disabling anything. */
const MIN_PAINS = 2

const emptyPain = () => ({
  text: '',
  quant: QUANT.map(() => ({ mode: 'exact' })),
  team: '',
  worst: '',
  guessOpen: true,
})

/* A pain point only counts once it has been named. Turns the user opened and
   left blank are neither counted towards the floor nor handed to the reveal. */
const isNamed = (pain) => pain.text.trim() !== ''

function Divider({ children }) {
  return (
    <div
      style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: 'var(--space-5) 0 var(--space-1)',
      }}
    >
      {children}
    </div>
  )
}

/* What the scan found, beside the questions rather than in front of them: it
   only ever shows what it can point to, and it never fills in an answer. */
function ScanPanel({ company, step }) {
  const facts = SCAN.slice(0, step)
  const looking = step < SCAN.length
  return (
    <aside
      style={{
        flex: '1 1 17rem',
        maxWidth: '20rem',
        position: 'sticky',
        top: 'var(--space-6)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-card)',
        background: 'var(--surface-card)',
        boxShadow: 'var(--shadow-xs)',
        padding: 'var(--space-5)',
      }}
    >
      <h3
        style={{
          margin: 0,
          font: 'var(--weight-semibold) var(--text-sm)/var(--leading-normal) var(--font-body)',
          color: 'var(--text-heading)',
        }}
      >
        While you talk
      </h3>
      <p
        style={{
          margin: 'var(--space-1) 0 var(--space-3)',
          font: 'var(--weight-regular) var(--text-xs)/var(--leading-relaxed) var(--font-body)',
          color: 'var(--text-muted)',
        }}
      >
        {`What we could verify about ${company || 'you'} — each with a source.`}
      </p>
      {facts.map((f, i) => (
        <ScanFactRow
          key={f.fact}
          stacked
          fact={f.fact}
          value={f.value}
          source={f.source}
          last={!looking && i === facts.length - 1}
        />
      ))}
      {looking && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) 0',
          }}
        >
          <span
            className="v2-pulse"
            aria-hidden="true"
            style={{
              width: 'var(--space-2)',
              height: 'var(--space-2)',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--lyrise-purple)',
            }}
          />
          <span
            style={{
              font: 'var(--weight-regular) var(--text-xs)/var(--leading-normal) var(--font-body)',
              color: 'var(--text-muted)',
            }}
          >
            {SCAN_LOOKING[Math.min(step, SCAN_LOOKING.length - 1)]}
          </span>
        </div>
      )}
      <p
        style={{
          margin: 0,
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 'var(--space-3)',
          font: 'var(--weight-regular) var(--text-xs)/var(--leading-relaxed) var(--font-body)',
          color: 'var(--neutral-400)',
        }}
      >
        We only show what we can point to. Everything else comes from you.
      </p>
    </aside>
  )
}

/* One pain point per screenful, in the order that makes the answers honest:
   the open question is the hero and is answered first, the researched guess
   sits under it in a dashed box that is visibly junior, and only then do the
   numbers get asked. Nothing here pre-fills the big box — a suggestion the
   user has to accept is data; a suggestion already in the field is a leading
   question. */
function Interview({
  turn,
  pain,
  namedCount,
  company,
  scan,
  onChange,
  onBack,
  onAdd,
  onFinish,
}) {
  const t = painAt(turn)
  const canFinish = namedCount >= MIN_PAINS
  const set = (fields) => onChange(fields)
  const setQuant = (i, value) =>
    onChange({ quant: pain.quant.map((q, j) => (j === i ? value : q)) })

  return (
    <section
      className="v2-rise"
      style={{
        flex: 1,
        width: '100%',
        maxWidth: '66rem',
        margin: '0 auto',
        padding: 'var(--space-8) var(--space-6) var(--space-20)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 'var(--space-12)',
      }}
    >
      <div style={{ flex: '1 1 30rem', minWidth: 0, maxWidth: '41rem' }}>
        <AnalystMark />
        <h2 style={QUESTION}>{t.question}</h2>
        <p style={{ ...LEAD, margin: 'var(--space-3) 0 var(--space-6)' }}>
          {t.sub}
        </p>

        {/* The hero. No label above it — the question is the label. */}
        <Input
          multiline
          rows={4}
          aria-label={t.question}
          placeholder={t.placeholder}
          value={pain.text}
          onChange={(e) => set({ text: e.target.value })}
          style={{ marginBottom: 'var(--space-3)' }}
        />

        {pain.guessOpen && t.guess && (
          <SuggestionBlock
            label="A guess from your website"
            suggestion={
              <>
                {`“${t.guess}” `}
                <ProvenanceMark variant="pill" kind={t.guessKind} />
              </>
            }
            source={t.guessWhy}
            /* No "Use this" once the user has written their own answer —
               accepting the guess would overwrite it with no way back. */
            onUse={
              isNamed(pain)
                ? undefined
                : () => set({ text: t.guess, guessOpen: false })
            }
            onDismiss={() => set({ guessOpen: false })}
          />
        )}

        <p
          style={{
            margin: 'var(--space-10) 0 var(--space-1)',
            font: 'var(--weight-regular) var(--text-sm)/var(--leading-normal) var(--font-body)',
            color: 'var(--text-muted)',
          }}
        >
          {t.quantIntro}
        </p>

        {QUANT.map((q, i) => (
          <Divider key={q.label}>
            <SegmentedInput
              label={q.label}
              placeholder={q.placeholder}
              value={pain.quant[i]}
              onChange={(value) => setQuant(i, value)}
              estimate={q.estimate}
              estimateBasis={q.why}
              estimateSource={q.kind}
            />
          </Divider>
        ))}

        <Divider>
          <Input
            label="Which team or department handles this?"
            placeholder="e.g. the paralegals, under operations"
            value={pain.team}
            onChange={(e) => set({ team: e.target.value })}
          />
        </Divider>
        <Divider>
          <Input
            label="What’s the worst part of it?"
            placeholder="in your own words — the bit everyone dreads"
            value={pain.worst}
            onChange={(e) => set({ worst: e.target.value })}
          />
        </Divider>

        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            paddingTop: 'var(--space-6)',
            marginTop: 'var(--space-5)',
          }}
        >
          <p
            style={{
              margin: '0 0 var(--space-5)',
              maxWidth: '52ch',
              font: 'var(--weight-regular) var(--text-sm)/var(--leading-relaxed) var(--font-body)',
              color: 'var(--text-muted)',
              textWrap: 'pretty',
            }}
          >
            {canFinish
              ? 'Every one you add is another part of the business I can actually see. Keep going while they’re front of mind — you can stop whenever.'
              : 'I need at least two to write something that holds up. Three or more and I can rank them properly and tell you which one to fix first.'}
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-4)',
            }}
          >
            <Button variant="ghost" size="sm" onClick={onBack}>
              Back
            </Button>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 'var(--space-3)',
              }}
            >
              <Button
                onClick={onAdd}
                iconRight={<Icon name="arrow-right" size={18} />}
              >
                I have another one
              </Button>
              {canFinish && (
                <Button variant="secondary" onClick={onFinish}>
                  That&rsquo;s all for now
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ScanPanel company={company} step={scan.step} />
    </section>
  )
}

/* What the calculator will read: the number the user gave, the range they gave,
   or the estimate they chose to leave standing — the mode is what makes an
   answer traceable, so it is never flattened away. */
function quantAnswer(answer = {}, q) {
  if (answer.mode === 'estimate') return `${q.estimate} (${q.kind})`
  if (answer.mode === 'range')
    return `${answer.low || '—'} to ${answer.high || '—'}`
  return answer.exact || '—'
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
      {/* A stub until the reveal is built (LYR-186). It reads the interview's
          real answers rather than a summary of them, which is the only thing
          this screen has to prove today: everything the calculator needs is
          in `flow.pains`. */}
      <ol
        style={{
          ...LEAD,
          margin: 'var(--space-4) 0 var(--space-6)',
          paddingLeft: 'var(--space-5)',
        }}
      >
        {flow.pains.map((pain, i) => (
          <li key={i} style={{ marginBottom: 'var(--space-3)' }}>
            {[
              pain.text || 'Unnamed',
              pain.team || 'team not named',
              ...pain.quant.map(
                (a, j) => `${QUANT[j].label} ${quantAnswer(a, QUANT[j])}`,
              ),
              `worst part: ${pain.worst || '—'}`,
            ].join(' · ')}
          </li>
        ))}
      </ol>
      <Button variant="secondary" onClick={onRestart}>
        Start over
      </Button>
    </section>
  )
}

const emptyFlow = () => ({
  step: 'landing',
  company: { name: '', website: '' },
  scan: { step: 0 },
  turn: 0,
  pains: [emptyPain()],
})

/* The scan is canned in the POC (LYR-178) and is fired, never awaited: the
   company form advances on the same tick and the facts land one at a time
   while the first questions are being answered. The timer is module-level so
   restarting the flow cannot leave two of them racing to fill the panel. */
let scanTimer
function startScan(setFlow) {
  clearInterval(scanTimer)
  let step = 0
  scanTimer = setInterval(() => {
    step += 1
    setFlow((f) => ({ ...f, scan: { step } }))
    if (step >= SCAN.length) clearInterval(scanTimer)
  }, 1500) // stands in for a research call; nothing downstream blocks on it
}

export default function V2() {
  const [flow, setFlow] = React.useState(emptyFlow)

  // Leaving /v2 mid-scan must not leave the interval setting state on nothing.
  React.useEffect(() => () => clearInterval(scanTimer), [])

  const go = (delta) =>
    setFlow((f) => ({
      ...f,
      step: STEPS[Math.min(Math.max(STEPS.indexOf(f.step) + delta, 0), 3)],
    }))
  const patch = (fields) => setFlow((f) => ({ ...f, ...fields }))

  /* Moving between pain points is not a step — the flow is still on
     `interview`. A turn the user has not reached yet gets a blank answer set
     appended; one they have is left exactly as they left it. */
  const goTurn = (turn) => {
    setFlow((f) => ({
      ...f,
      turn,
      pains: f.pains[turn] ? f.pains : [...f.pains, emptyPain()],
    }))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

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
              patch({ step: 'interview', scan: { step: 0 } })
              startScan(setFlow)
            }}
          />
        )}
        {flow.step === 'interview' && (
          <Interview
            turn={flow.turn}
            pain={flow.pains[flow.turn]}
            namedCount={flow.pains.filter(isNamed).length}
            company={flow.company.name}
            scan={flow.scan}
            onChange={(fields) =>
              setFlow((f) => ({
                ...f,
                pains: f.pains.map((p, i) =>
                  i === f.turn ? { ...p, ...fields } : p,
                ),
              }))
            }
            /* Going back is cheap and lossless: earlier pain points are kept
               in `pains`, so returning to one shows what was typed. */
            onBack={() => (flow.turn > 0 ? goTurn(flow.turn - 1) : go(-1))}
            onAdd={() => goTurn(flow.turn + 1)}
            /* Turns opened and left blank are dropped here rather than on the
               way in, so backing up to one still shows it. */
            onFinish={() => {
              setFlow((f) => ({ ...f, pains: f.pains.filter(isNamed) }))
              go(1)
            }}
          />
        )}
        {flow.step === 'reveal' && (
          <Reveal flow={flow} onRestart={() => setFlow(emptyFlow)} />
        )}
      </Shell>
    </>
  )
}
