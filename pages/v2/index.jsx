/* POC of the redesigned Profit Map (LYR-178, scaffold: LYR-182).

   Parallel route, deliberately. Everything under /v2 is isolated from the live
   alpha: no auth, no alpha cap, no `reports`/`state_data`, and nothing imported
   from `src/lib/roi/` on this page. The live app must behave identically with
   this directory deleted — which is also how it gets thrown away later.

   The one server call it makes is `/api/v2/research`, the scan panel's SSE
   stream (LYR-199). It is opened when the company form is submitted and never
   awaited: research takes 5-20s and the interview must be usable throughout.

   The token layer needs no import here: `styles/global.css` is loaded once in
   `pages/_app.js`, so every CSS custom property the primitives read is already
   on the document. `Shell` below is this route's own layout — the alpha's
   chrome is not reused.

   Flow state is a single object in this component and lives in memory only.
   A refresh starts over; that's the accepted trade for a supervised demo
   (LYR-182: "state can live in memory"). Landing and company are built
   (LYR-183), the interview is built (LYR-184), the company scan panel is
   built (LYR-185) and now reads real research (LYR-199); the reveal is still
   a stub.

   The interview does not add a step: `flow.turn` walks the pain points inside
   the `interview` step, and every answer for every pain point stays in
   `flow.pains` for the whole session. That is what makes going back cheap and
   what hands the calculator the full set at the end.

   Sizes here are tokens or relative units — no raw px (P10). Inline styles
   can't carry media queries, so everything responsive comes from `clamp()`,
   `ch` max-widths and wrapping flex rows instead. */
import * as React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Image from 'next/image'
import Logo from '@/src/assets/logo.svg'
import { fmtDate } from '@/src/lib/formatDate'
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

/* Two fields, then straight into the interview. Submitting opens the research
   stream but never waits for it — see `useScan`. */
function Company({ value, onChange, onBack, onSubmit }) {
  const submit = (e) => {
    e.preventDefault()
    onSubmit()
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
            placeholder="e.g. Dr. Job Pro"
            value={value.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          <Input
            label="Website"
            placeholder="drjobpro.com"
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
          {/* Not gated on a name: an unnamed company falls back to the demo
              one, and a demo you can't walk without typing isn't a demo. */}
          <Button
            type="submit"
            iconRight={<Icon name="arrow-right" size={18} />}
          >
            Next
          </Button>
        </div>
      </form>
    </section>
  )
}

/* The interview's own wording, which is the same for every prospect: the
   questions, what they're for, and a placeholder generic enough to stand when
   we know nothing about the company. Everything that cites a specific business
   — the placeholder's example, the researched guess, the number estimates —
   lives per company in `DEMOS` and is merged over the top by `painFor` and
   `quantFor`. Nothing company-specific may be hardcoded here: it would follow
   the wrong prospect into the demo.

   Read the question strings aloud before editing one. The rule the whole
   screen is built on is that none of them may contain "percent",
   "automatable", "headcount", "volume", "FTE" or "blended rate" (LYR-184). */
const PAINS = [
  {
    question:
      'Where do your teams lose the most time each week — the stuff that’s repetitive but somehow still eats hours?',
    sub: 'Tell me in your own words. The more specific, the sharper your numbers get.',
    placeholder: 'e.g. the same information gets re-typed into three systems',
    quantIntro: 'Once you name it, a few quick things about that work:',
  },
  {
    question:
      'What’s the second one? Something else that drains a team the same way.',
    sub: 'A different team is fine — often it’s a different one entirely.',
    placeholder: 'e.g. someone rebuilds the same report by hand every Friday',
    quantIntro: 'Same questions for this one:',
  },
  {
    question: 'And a third. The third one usually surprises people.',
    sub: 'The third one is where I start seeing the pattern rather than the incident.',
    placeholder: 'e.g. two people chase the same missing paperwork all week',
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
  quantIntro: 'Same questions:',
}

/* The five number questions, asked the same way for every pain point.
   The last one becomes `automatable%` downstream — it is the single largest
   guess in the whole model, which is why it is asked rather than assumed.

   The estimate here is the one we give when we know nothing about the company,
   and it is deliberately not a number. An estimate with no evidence under it is
   the fabrication this whole POC exists to stop; saying so is more useful than
   inventing a plausible figure the prospect then has to argue with. A company
   we did scan overrides all four fields from `DEMOS`. */
const QUANT = [
  {
    label: 'How many times does this happen, start to finish, in a month?',
    placeholder: '200 a month',
    estimate: 'Nothing to base one on',
    kind: 'estimated',
    why: 'We couldn’t find anything public about you, so an estimate here would be a guess about a guess. This one matters most — it multiplies everything below it — so it’s worth your real number.',
  },
  {
    label: 'How many people do it?',
    placeholder: '4',
    estimate: 'Nothing to base one on',
    kind: 'estimated',
    why: 'Nothing we found tells us how many people touch this. Your number is the only one worth having.',
  },
  {
    label: 'Hours a week, each?',
    placeholder: '12',
    estimate: 'Nothing to base one on',
    kind: 'estimated',
    why: 'This one varies more between two companies of the same size than almost anything else, and we have nothing on yours to narrow it.',
  },
  {
    label: 'Roughly what they earn?',
    placeholder: '$70k a year',
    estimate: 'Nothing to base one on',
    kind: 'estimated',
    why: 'Pay depends on the role and the market, and we don’t know either for you yet. A rough band is fine.',
  },
  {
    label:
      'If a system did the repetitive part, how much would still need a person?',
    placeholder: 'about a third',
    estimate: 'about a third',
    kind: 'estimated',
    why: 'Our read across this kind of work, not a read of yours: the repetitive part follows rules, the odd cases still need judgment. Nothing scraped — correct it freely.',
  },
]

/* One record per demo company (LYR-185): the guess the analyst offers against
   each pain point, and the number estimates behind "Let AI estimate".

   The `scan` arrays these records used to carry are gone (LYR-199). The panel
   reads the real research system now, so canned facts here would be a second,
   contradicting source of truth for the same panel.

   The guesses and estimates are still canned, and are out of this card's
   scope — LYR-186 is where the reveal starts reading the analyst's findings.
   Until then the demo domains are `drjobpro.com`, `harbourfield.com`,
   `northaxle.com` and `verdantdental.com`; anything else gets no guesses and
   estimates that say they have nothing to stand on. Note what that means: the
   guesses may now cite something the panel never showed, because the panel is
   live and they are not. They stay visibly junior — a dashed box marked
   `estimated`, next to a field the user can overrule — which is the only
   reason that is survivable for the length of one card.

   Nothing here may infer a workflow, a department or an "operating model" into
   the PANEL. That inference is what made the old research agent untrustworthy.
   The scan shows what we can point at; the interview gets everything else. */
const DEMOS = {
  /* Dr. Job Pro (drjobpro.com) is the demo we actually show, so none of this is
     invented: every line was read off the live site, and the two lines the v17
     prototype had that reached past the evidence — "60–80 staff across sales,
     support and operations" and "support arrives on all three" — are gone.
     They named departments and workflows their own sources don't show. */
  'drjobpro.com': {
    name: 'Dr. Job Pro',
    pains: [
      {
        placeholder:
          'e.g. coordinators read every application against the job spec by hand',
        guess: 'Reading applications against the job spec looks done by eye.',
        guessKind: 'estimated',
        guessWhy:
          'Cairo alone lists about 8,000 live vacancies (drjobpro.com/egypt), so applications arrive somewhere in volume. Nothing public says who reads them or how. That’s a read, not a fact.',
      },
      {
        placeholder:
          'e.g. the same employer question gets answered on WhatsApp, email and the help centre',
        guess: 'The same questions arriving on three channels at once.',
        guessKind: 'scraped',
        guessWhy:
          'Your contact page offers WhatsApp, email and a help centre — that’s from drjobpro.com/contact-us. What we can’t see is who answers them, or how often it’s the same question.',
      },
      {
        placeholder:
          'e.g. someone rebuilds the renewal list from the billing export every month',
        guess: 'Employer packages renewed and chased by hand.',
        guessKind: 'benchmarked',
        guessWhy:
          'Packages are sold on cycles (employer.drjobpro.com/pricing), and platforms your size usually chase renewals manually until someone builds the report. Nothing on your site confirms it either way.',
      },
    ],
    quant: [
      {
        placeholder: '2,600 applications',
        estimate: 'about 2,600 a month',
        kind: 'benchmarked',
        why: 'Platforms carrying thousands of live vacancies across nine markets typically see applications in the low thousands a month. This one matters most — it multiplies everything below it.',
      },
      {
        placeholder: '7',
        estimate: 'about 7 people',
        kind: 'benchmarked',
        why: 'Typical for a platform at your listing volume. Nothing public tells us your team’s shape, which makes this the weakest guess on the page.',
      },
      {
        placeholder: '18',
        estimate: 'about 18 hours',
        kind: 'benchmarked',
        why: 'The middle of what teams doing this kind of reading report — not your number.',
      },
      {
        placeholder: '$18k a year',
        estimate: 'about $18k a year',
        kind: 'benchmarked',
        why: 'Regional pay data for coordinator roles in Egypt and the UAE, which is where two of your three offices are (drjobpro.com/contact-us).',
      },
      {
        placeholder: 'about a quarter',
        estimate: 'about a quarter',
        kind: 'estimated',
        why: 'Our read: ranking against a written spec follows rules, but borderline candidates and the final call still need a person. Nothing scraped — correct it freely.',
      },
    ],
  },

  'harbourfield.com': {
    name: 'Harbourfield Legal',
    pains: [
      {
        placeholder:
          'e.g. our paralegals re-key client intake forms into three different systems by hand',
        guess:
          'Contract review and client reporting look manual for a firm your size.',
        guessKind: 'estimated',
        guessWhy:
          'Your site lists commercial, property and employment work with fixed-fee pricing, and neither open role mentions a document system — so we’d expect review to be done by hand. That’s a read, not a fact.',
      },
      {
        placeholder:
          'e.g. someone rebuilds the same client status report by hand every Friday',
        guess: 'Monthly billing prep looks like it’s assembled by hand.',
        guessKind: 'benchmarked',
        guessWhy:
          'Fixed-fee firms your size usually assemble billing from timesheets manually each month. Nothing on your site says otherwise, but nothing confirms it either.',
      },
      {
        placeholder:
          'e.g. two people chase missing documents over email all week',
        guess:
          'Chasing missing documents looks like email work someone does by hand.',
        guessKind: 'scraped',
        guessWhy:
          'Both of your open roles ask for chasing outstanding client paperwork — that’s from your own careers page.',
      },
    ],
    quant: [
      {
        placeholder: '200 client intakes',
        estimate: 'about 200 a month',
        kind: 'benchmarked',
        why: 'A firm of 42 taking on commercial, property and employment work typically opens around 200 matters a month. This one matters — it multiplies everything below it.',
      },
      {
        placeholder: '4',
        estimate: 'about 4 people',
        kind: 'scraped',
        why: 'Your team page (harbourfield.com/team) lists four paralegals under operations.',
      },
      {
        placeholder: '12',
        estimate: 'about 12 hours',
        kind: 'benchmarked',
        why: 'The middle of what firms of 40–60 people report for this kind of work — not your number.',
      },
      {
        placeholder: '$70k a year',
        estimate: 'about $72k a year',
        kind: 'benchmarked',
        why: 'Regional pay data for paralegals at firms your size.',
      },
      {
        placeholder: 'about a third',
        estimate: 'about a third',
        kind: 'estimated',
        why: 'Our read: re-keying follows rules, but conflict checks and odd cases still need judgment. Nothing scraped — correct it freely.',
      },
    ],
  },

  'northaxle.com': {
    name: 'Northaxle Freight',
    pains: [
      {
        placeholder:
          'e.g. load paperwork gets re-keyed from email into the TMS by hand',
        guess: 'Building and re-keying load paperwork looks manual.',
        guessKind: 'estimated',
        guessWhy:
          'Your services page lists LTL, full truckload and drayage (northaxle.com/services) — three different document sets — and the only system your site exposes is a McLeod portal login. We’d expect hand-keying between them. That’s a read, not a fact.',
      },
      {
        placeholder: 'e.g. dispatchers make the same check calls all afternoon',
        guess: 'Carrier check calls made one at a time, by phone.',
        guessKind: 'benchmarked',
        guessWhy:
          'Brokerages running three terminals usually still make check calls by hand. Nothing on your site says otherwise, but nothing confirms it either.',
      },
      {
        placeholder:
          'e.g. someone chases proof-of-delivery paperwork before we can invoice',
        guess: 'Chasing delivery paperwork before an invoice can go out.',
        guessKind: 'benchmarked',
        guessWhy:
          'Three of your four open roles are in dispatch (northaxle.com/careers), and in brokerages that team usually ends up chasing the paperwork too. The postings are fact; what they spend the day on is our guess.',
      },
    ],
    quant: [
      {
        placeholder: '900 loads',
        estimate: 'about 900 a month',
        kind: 'benchmarked',
        why: 'A brokerage running three terminals typically moves loads in the high hundreds a month. This one matters — it multiplies everything below it.',
      },
      {
        placeholder: '6',
        estimate: 'about 6 people',
        kind: 'benchmarked',
        why: 'Typical dispatch bench for that load count. Your careers page tells us you’re hiring three more (northaxle.com/careers), not how many you have.',
      },
      {
        placeholder: '15',
        estimate: 'about 15 hours',
        kind: 'benchmarked',
        why: 'The middle of what dispatch teams report for paperwork and check calls — not your number.',
      },
      {
        placeholder: '$52k a year',
        estimate: 'about $54k a year',
        kind: 'benchmarked',
        why: 'US pay data for dispatch and brokerage support roles in your three markets.',
      },
      {
        placeholder: 'about a third',
        estimate: 'about a third',
        kind: 'estimated',
        why: 'Our read: the keying and the calling follow rules, but exceptions and unhappy carriers still need a person. Nothing scraped — correct it freely.',
      },
    ],
  },

  'verdantdental.com': {
    name: 'Verdant Dental',
    pains: [
      {
        placeholder:
          'e.g. the front desk prepares and resubmits insurance claims by hand',
        guess: 'Insurance claims prepared and resubmitted by hand.',
        guessKind: 'scraped',
        guessWhy:
          'Both of your open front-desk roles mention insurance claims — that’s from verdantdental.com/careers. How much of the day it takes is what we can’t see.',
      },
      {
        placeholder:
          'e.g. someone phones through the recall list for each practice every week',
        guess: 'Recalls and reminders chased practice by practice.',
        guessKind: 'benchmarked',
        guessWhy:
          'Groups with five sites (verdantdental.com/locations) usually run recalls per practice until someone centralises it. Nothing on your site confirms it.',
      },
      {
        placeholder:
          'e.g. the same patient details get re-entered when they move between practices',
        guess: 'The same patient details re-entered between practices.',
        guessKind: 'estimated',
        guessWhy:
          'Five practices and a single patient portal on the site (builtwith.com) — we’d expect some re-keying between them. That’s a read, not a fact.',
      },
    ],
    quant: [
      {
        placeholder: '400 claims',
        estimate: 'about 400 a month',
        kind: 'benchmarked',
        why: 'Typical claim volume for five practices at your service mix. This one matters — it multiplies everything below it.',
      },
      {
        placeholder: '3',
        estimate: 'about 3 people',
        kind: 'benchmarked',
        why: 'Front-desk cover across five sites usually lands here. Your careers page says you’re hiring two (verdantdental.com/careers), not how many you have.',
      },
      {
        placeholder: '10',
        estimate: 'about 10 hours',
        kind: 'benchmarked',
        why: 'The middle of what practice groups report for claims work — not your number.',
      },
      {
        placeholder: '$45k a year',
        estimate: 'about $46k a year',
        kind: 'benchmarked',
        why: 'Arizona pay data for dental front-desk and billing roles.',
      },
      {
        placeholder: 'about a third',
        estimate: 'about a third',
        kind: 'estimated',
        why: 'Our read: preparing and resubmitting follows rules, but denials and patient calls still need a person. Nothing scraped — correct it freely.',
      },
    ],
  },
}

/* Whatever the user typed in the Website field, down to the key `DEMOS` uses:
   `https://www.DrJobPro.com/about` and `drjobpro.com` are one company.

   An empty field or an unrecognised domain falls back to the demo company, so
   the whole flow is walkable on Next, Next, Next without typing anything —
   which is how it gets shown. `/v2?scan=none` is the door to the state where
   we know nothing about the company: since LYR-199 it no longer suppresses the
   panel — the panel is live, and there is nothing canned left to suppress —
   but it still switches off the canned guesses and estimates, which is what it
   was really for. */
const DEFAULT_DEMO = 'drjobpro.com'
const demoFor = (website = '') =>
  DEMOS[
    website
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
  ] || DEMOS[DEFAULT_DEMO]

/* The shared question, with whatever we know about this company merged over it.
   A company with no demo record keeps the generic placeholder and gets no
   `guess` at all — the block only renders when there is one. Pain points past
   the third never get a guess, whoever the company is. */
const painFor = (demo, i) => ({
  ...(PAINS[i] || EXTRA_PAIN),
  ...((PAINS[i] && demo && demo.pains[i]) || {}),
})
const quantFor = (demo, i) => ({
  ...QUANT[i],
  ...((demo && demo.quant[i]) || {}),
})

/* Two is the floor for a report that holds up; the copy says why rather than
   disabling anything. */
const MIN_PAINS = 2

/* The question column, and the interview's width with the scan panel beside it.
   Without a panel the column is the whole screen and centres, rather than
   sitting against a gutter of nothing. */
const COLUMN = '41rem'
const COLUMN_PLUS_PANEL = '66rem'

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

/* One row's source, as something a person would read: the host, and enough of
   the path to tell an about page from a careers page. Long ATS URLs are cut
   rather than allowed to wrap the panel out of shape — the link still opens
   the full URL, which is the part that has to be true. */
const SOURCE_MAX = 34
function sourceLabel(url) {
  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const label = (parsed.host.replace(/^www\./, '') + parsed.pathname).replace(
    /\/$/,
    '',
  )
  return label.length > SOURCE_MAX
    ? `${label.slice(0, SOURCE_MAX - 1)}…`
    : label
}

/* Enrichment data is a monthly-refreshed cache, not a live read, so a fact
   that came from it is dated in front of the prospect. A six-month-old
   headcount presented as current is exactly the credibility damage this
   product exists to avoid, and it is the kind of thing the person reading it
   is best placed to notice. Everything else was fetched during this run and
   needs no caveat. */
function findingAge(finding) {
  if (finding.sourceType !== 'enrichment' || !finding.retrievedAt) return null
  const shown = fmtDate(finding.retrievedAt)
  return shown === '—' ? null : `as of ${shown}`
}

/* What the research found, beside the questions rather than in front of them:
   it only ever shows what it can point to, and it never fills in an answer.

   Three states, and the third one is the point: findings render as they
   stream in; while scouts are still out it says so quietly; with nothing found
   at all it renders nothing. An empty panel reads as broken, and a panel
   promising a scan it can't deliver is worse than no panel (LYR-185).

   No ranking, no cap and no diversity rule. The analyst has already decided
   what is worth saying and written each line (LYR-216); a second selection
   layer here would silently discard reasoning that has already been done, and
   a truncation would drop findings for no reason a prospect could see. The
   headline is rendered as written and the sourceUrl as the link — this
   component makes no model call and no judgement of its own (LYR-199). */
function ScanPanel({ company, findings, looking }) {
  /* Empty is nothing at all, not an empty box. Once the run is done and
     nothing was found, the panel leaves the screen — the interview is the
     whole product without it. */
  if (findings.length === 0 && !looking) return null
  return (
    <aside
      /* Named so it stays a landmark: an unnamed <aside> inside <section> maps
         to `generic`, not `complementary`. */
      aria-label="Company scan"
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
      {findings.map((f, i) => {
        const age = findingAge(f)
        return (
          <ScanFactRow
            /* The analyst may say more than one thing about one source, so the
               URL alone is not a key. */
            key={`${f.sourceUrl}\n${f.headline}`}
            stacked
            fact={f.kind}
            value={
              age ? (
                <>
                  {f.headline}{' '}
                  <span
                    style={{
                      font: 'var(--weight-regular) var(--text-xs)/1.4 var(--font-body)',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ({age})
                  </span>
                </>
              ) : (
                f.headline
              )
            }
            source={sourceLabel(f.sourceUrl)}
            sourceUrl={f.sourceUrl}
            last={!looking && i === findings.length - 1}
          />
        )
      })}
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
            Reading what&rsquo;s public about you&hellip;
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
  demo,
  scan,
  onChange,
  onBack,
  onAdd,
  onFinish,
}) {
  const t = painFor(demo, turn)
  const quant = QUANT.map((_, i) => quantFor(demo, i))
  const sharper = namedCount >= MIN_PAINS
  /* Whether the panel is on screen, which is what the width has to key on —
     `demo` used to stand in for it and no longer can now that the panel is
     live research rather than a canned array. A run that ends up finding
     nothing therefore re-centres the column once, at the moment we learn
     there is nothing: the alternative is leaving a gutter of nothing beside
     the questions for the rest of the interview. */
  const hasPanel = scan.findings.length > 0 || scan.looking

  const set = (fields) => onChange(fields)
  const setQuant = (i, value) =>
    onChange({ quant: pain.quant.map((q, j) => (j === i ? value : q)) })

  return (
    <section
      className="v2-rise"
      style={{
        flex: 1,
        width: '100%',
        maxWidth: hasPanel ? COLUMN_PLUS_PANEL : COLUMN,
        margin: '0 auto',
        padding: 'var(--space-8) var(--space-6) var(--space-20)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-start',
        gap: 'var(--space-12)',
      }}
    >
      <div style={{ flex: '1 1 30rem', minWidth: 0, maxWidth: COLUMN }}>
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

        {quant.map((q, i) => (
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
            placeholder="e.g. the team that does it, and who they sit under"
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
            {sharper
              ? 'Every one you add is another part of the business I can actually see. Keep going while they’re front of mind — you can stop whenever.'
              : 'Two makes the report hold up, and three lets me rank them and tell you which to fix first. Stop whenever you like — anything you leave blank, I fall back to my own guess and label it as mine.'}
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
              {/* Never gated. Leaving now is always allowed; what a blank
                  answer costs is said above, not enforced here. */}
              <Button variant="secondary" onClick={onFinish}>
                That&rsquo;s all for now
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ScanPanel
        company={company}
        findings={scan.findings}
        looking={scan.looking}
      />
    </section>
  )
}

/* What the calculator will read: the number the user gave, the range they gave,
   or — for anything they left blank — the estimate, carrying the tag that says
   whose number it is. A blank must never become a dash: the demo is walkable
   without typing, so most answers in a demo run are blank, and a report full of
   dashes is no report. The tag is what keeps that honest, so it is never
   flattened away. */
function quantAnswer(answer = {}, q) {
  if (answer.mode === 'exact' && answer.exact) return answer.exact
  if (answer.mode === 'range' && (answer.low || answer.high))
    return `${answer.low || '—'} to ${answer.high || '—'}`
  return `${q.estimate} (${q.kind})`
}

/* `demo` is passed in rather than resolved here: an estimate the user left
   standing is only traceable against the record the interview actually showed
   them. */
function Reveal({ flow, demo, onRestart }) {
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
      <h2 style={QUESTION}>
        {flow.company.name || (demo && demo.name) || 'Your company'}
      </h2>
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
              pain.fromGuess
                ? `${pain.text} (our guess, not yours)`
                : pain.text,
              pain.team || 'team not named',
              ...pain.quant.map((a, j) => {
                const q = quantFor(demo, j)
                return `${q.label} ${quantAnswer(a, q)}`
              }),
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
  /* The website as it was when the form was submitted, which is what the
     research stream is keyed on. Held separately from `company.website` so
     that typing in the field does not fire a research run per keystroke. */
  scanFor: '',
  turn: 0,
  pains: [emptyPain()],
})

/* The scan panel's data (LYR-199): one SSE stream, opened when the company
   form is submitted and never awaited. The interview renders on the same tick
   the form submits and findings append as they arrive, so a slow scout costs
   a row rather than the panel.

   `EventSource` rather than a fetch stream because it is the browser's own SSE
   reader and this request carries one parameter — a hand-rolled reader would
   be more code for the same bytes. The one thing it does that we do not want
   is reconnect when the server hangs up, and a reconnect here means a second
   research run: the same crawl and the same model calls, billed again. So the
   client closes the stream itself on `done` and on error.

   A website we cannot make a domain of is rejected by the route, which the
   browser surfaces as an error — the panel stops looking and, having found
   nothing, renders nothing. That is the correct outcome for a company we know
   nothing about. */
function useScan(website) {
  const [scan, setScan] = React.useState({ findings: [], looking: false })

  React.useEffect(() => {
    if (!website) {
      setScan({ findings: [], looking: false })
      return undefined
    }
    setScan({ findings: [], looking: true })

    const stream = new EventSource(
      `/api/v2/research?domain=${encodeURIComponent(website)}`,
    )
    const stop = () => {
      stream.close()
      setScan((current) => ({ ...current, looking: false }))
    }
    stream.onmessage = (message) => {
      let event
      try {
        event = JSON.parse(message.data)
      } catch {
        return /* a malformed frame costs its own row, never the stream */
      }
      if (event.type === 'done') {
        stop()
        return
      }
      /* The analyst already drops any finding whose citation is not in the
         fact store, so a missing sourceUrl should be impossible. Checked again
         because the failure mode if it ever happened is a line on the panel
         with no source under it, which is precisely what the panel's own copy
         promises never to show. Fail safe: no source, no row. */
      if (event.type !== 'finding' || !event.finding?.sourceUrl) return
      setScan((current) => ({
        ...current,
        findings: [...current.findings, event.finding],
      }))
    }
    stream.onerror = stop

    /* Leaving /v2 mid-run must not leave a stream setting state on nothing —
       and closing it is also what tells the server to stop, since client
       disconnect is the route's stop signal. */
    return () => stream.close()
  }, [website])

  return scan
}

export default function V2() {
  const [flow, setFlow] = React.useState(emptyFlow)
  /* `/v2?scan=none` switches off the canned guesses and estimates. It needs a
     door of its own now that an unrecognised domain falls back to the demo
     company. */
  const demo =
    useRouter().query.scan === 'none'
      ? undefined
      : demoFor(flow.company.website)

  const scan = useScan(flow.scanFor)

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
              /* Fired, not awaited: this advances to the interview on the
                 same tick and the panel fills behind it. */
              patch({ step: 'interview', scanFor: flow.company.website })
            }}
          />
        )}
        {flow.step === 'interview' && (
          <Interview
            turn={flow.turn}
            pain={flow.pains[flow.turn]}
            namedCount={flow.pains.filter(isNamed).length}
            company={flow.company.name || (demo && demo.name)}
            /* Resolved from the website field at render rather than copied into
               `flow` — one source of truth, and editing the website on the way
               back through the company screen re-scans by definition. */
            demo={demo}
            scan={scan}
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
            /* Blank turns fall back to the guess we showed for them, flagged
               so the reveal can say whose words they are. A turn with no guess
               to fall back on is dropped — that, not the finish button, is
               where an empty pain point stops. Done here rather than on the way
               in so backing up to a blank turn still shows it blank. */
            onFinish={() => {
              setFlow((f) => ({
                ...f,
                pains: f.pains
                  .map((p, i) =>
                    isNamed(p)
                      ? p
                      : {
                          ...p,
                          text: painFor(demo, i).guess || '',
                          fromGuess: true,
                        },
                  )
                  .filter(isNamed),
              }))
              go(1)
            }}
          />
        )}
        {flow.step === 'reveal' && (
          <Reveal
            flow={flow}
            demo={demo}
            onRestart={() => setFlow(emptyFlow)}
          />
        )}
      </Shell>
    </>
  )
}
