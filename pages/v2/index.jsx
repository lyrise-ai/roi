/* POC of the redesigned Profit Map (LYR-178, scaffold: LYR-182).

   This is a separate page on purpose. Nothing under /v2 touches the live app:
   no login, no alpha limit, no `reports`/`state_data` tables, and no imports
   from the production ROI code (`src/lib/roi/pipeline`, `src/lib/roi/agent.ts`
   and friends). `src/lib/roi/v2/` is this POC's own corner of that folder —
   its own calculator (LYR-186) and its own answer reader (LYR-188), sharing no
   code with the pipeline — so that folder is fine to use. Delete this whole
   directory and the live app must behave exactly the same. That is also how we
   throw it away later.

   It calls the server once: `/api/v2/research` (LYR-199), which fills the scan
   panel. The call starts when the company form is submitted and we never wait
   for it — research takes 5 to 20 seconds, and the questions have to stay
   usable the whole time.

   No need to import the design tokens here. `styles/global.css` is loaded once
   in `pages/_app.js`, so every CSS variable the shared components read is
   already on the page. `Shell` below is this route's own layout; we do not
   reuse the live app's chrome.

   Every answer lives in one object in this component, in memory only. A
   refresh loses it. That is the accepted trade for a demo someone runs in
   front of a prospect (LYR-182: "state can live in memory"). Landing and
   company are built (LYR-183), the questions are built (LYR-184), the scan
   panel is built (LYR-185) and now reads real research (LYR-199), and the
   reveal screen is built (LYR-188).

   The questions are not a separate step. `flow.turn` counts which pain point
   we are on inside the `interview` step, and every answer for every pain point
   stays in `flow.pains` for the whole session. That is what makes going back
   cheap, and what hands the calculator the full set at the end.

   Sizes here are design tokens or relative units — never raw pixels (P10).
   Inline styles cannot hold media queries, so anything responsive is done with
   `clamp()`, `ch` widths, and flex rows that wrap. */
import * as React from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import Image from 'next/image'
import Logo from '@/src/assets/logo.svg'
import { fmtDate } from '@/src/lib/formatDate'
import {
  Button,
  Dialog,
  Icon,
  Input,
  ProvenanceMark,
  ScanFactRow,
  SegmentedInput,
  SuggestionBlock,
} from '@components/ui'
import {
  assembleCalculatorInput,
  bridgePainQuant,
} from '@/src/lib/roi/v2/answerBridge'
import { calculateMiniProfitMap } from '@/src/lib/roi/v2/miniCalculator'
import { buildObservationSentence } from '@/src/lib/roi/v2/observation'

const STEPS = ['landing', 'company', 'interview', 'reveal']

/* The two heading sizes this design needs fall between the sizes the design
   system names: --type-h1 (48px) is too big on a phone, --type-h2 too big for
   a question. So both slide between two existing size tokens instead of adding
   new ones. */
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

/* The two big numbers on the reveal screen (LYR-188 / POC 10, piece 2). Same
   size for both. What makes one of them impressive is the number itself, not a
   larger font. */
const FIGURE_LABEL = {
  font: 'var(--weight-semibold) var(--text-sm)/var(--leading-normal) var(--font-body)',
  color: 'var(--text-muted)',
  margin: '0 0 var(--space-1)',
}
const FIGURE_VALUE = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--space-2)',
  margin: 0,
  font: 'var(--weight-extrabold) clamp(var(--text-3xl), 7vw, var(--text-5xl))/var(--leading-tight) var(--font-display)',
  letterSpacing: 'var(--tracking-tight)',
  color: 'var(--text-heading)',
}
const FIGURE_UNIT = {
  font: 'var(--weight-regular) var(--text-lg)/1 var(--font-body)',
  color: 'var(--text-muted)',
}

/* Piece 4 (LYR-188 / POC 10): the pop-up that shows how the money figure was
   worked out. Each line is copied straight from calc.formulas — we never redo
   the maths here — in the order the figure is actually built up. `annualHours`
   is left out on purpose: it belongs to the OTHER figure (hours spent), which
   carries no guesses, so it is not one of the assumptions behind this one. */
const FORMULA_ROWS = [
  { key: 'hoursReturned', label: 'Hours returned' },
  { key: 'ratePerHour', label: 'Rate per hour' },
  { key: 'operationalDividend', label: 'Operational dividend' },
  { key: 'profitUplift', label: 'Profit uplift' },
  { key: 'totalFinancialGain', label: 'Total financial gain' },
]

/* Each screen slides up 8px when it appears. It lives in this file, not in
   styles/global.css, so /v2 stays one folder you can delete. And it is a CSS
   class, not an inline style, because only a class can be overridden by the
   "user asked for less motion" media query below. */
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
        {/* 70x24 keeps the logo file's own 138:47 shape at --space-6 tall. The
            size is set with width/height attributes, not CSS, because
            next/image warns when the size on screen does not match the size it
            was told. */}
        <Image src={Logo} alt="LyRise" width={70} height={24} priority />
        {/* No progress bar on the first screen — nothing has started yet. */}
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

/* The analyst should feel present, not cute: a dot and a name, no animation. */
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

/* One line of text, one button, three small labels. No splash screen, no
   typewriter effect, no auto-advance. Holding back is the design (LYR-183). */
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
        {/* Each dot is grouped with the label after it, so on a narrow screen a
            line never ends with a lonely dot. */}
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

/* Two fields, then straight into the questions. Submitting starts the research
   call but never waits for it — see `useScan`. */
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

      {/* TODO(agent) — both fields are free text and are read by regex today
          (demoFor() normalises the domain, the name is used verbatim). An
          agent should read them instead: "Dr Job Pro, Cairo" carries the
          country and therefore the report's currency and working-weeks
          constant, which we currently assume are US dollars and 50. See the
          TODO(agent) block in src/lib/roi/v2/answerBridge.ts for the rule. */}
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
          {/* The button works even with the fields empty. An empty company
              falls back to the demo company, and a demo you cannot click
              through without typing is not a demo. */}
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

/* The wording every prospect sees, no matter who they are: the questions, why
   we ask them, and a grey example text that still makes sense when we know
   nothing about the company.

   Anything that names a specific business — the example text, the guess we
   offer, the number estimates — lives per company in `DEMOS` further down, and
   `painFor` and `quantFor` lay it over the top of this. Never hardcode
   anything company-specific here: it would show up for the wrong prospect.

   Read a question out loud before you change it. The rule this whole screen is
   built on: no question may contain "percent", "automatable", "headcount",
   "volume", "FTE" or "blended rate" (LYR-184). */
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

/* What we say from the fourth pain point on. It is only wording, not a limit —
   the button still works, the analyst just says what it thinks. */
const EXTRA_PAIN = {
  question: 'Another one, then.',
  sub: 'Worth adding only if it’s genuinely bleeding — I’d rather model three well than six loosely.',
  placeholder:
    'e.g. onboarding a new client takes a week of copy-paste across systems',
  quantIntro: 'Same questions:',
}

/* The five number questions, asked the same way for every pain point.

   TODO(agent) — all five are answered by typing into a box, and the grey
   example text here ("$70k a year", "about a third") teaches a style that the
   plain text-matching code in answerBridge.ts cannot read back. These answers
   should be read by an agent instead. The full rule is in that file, under
   TODO(agent).

   The last question asks what is LEFT OVER — how much still needs a person. It
   gets flipped later into "how much can be automated" by bridgeAutomatable()
   in answerBridge.ts (confirmed, PR #56). It is the biggest single guess in
   the whole model, which is why we ask it instead of assuming it.

   The `estimate` text here is what we say when we know nothing about the
   company, and it is deliberately not a number. A guess with no evidence under
   it is exactly the thing this POC exists to stop. Saying "we have nothing to
   base this on" is more useful than making up a believable number the prospect
   then has to argue with. For a company we did research, `DEMOS` below
   replaces these four estimates. */
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

/* One entry per demo company (LYR-185): the guess the analyst offers for each
   pain point, and the number estimates behind the "Let AI estimate" button.

   These entries used to also hold canned facts for the scan panel. Those are
   gone (LYR-199) — the panel reads the real research system now, and keeping
   canned facts too would mean two sources for the same panel, disagreeing with
   each other.

   The guesses and number estimates are still canned. Replacing them with real
   findings is LYR-186's job, not this one. Until then the demo domains are
   `drjobpro.com`, `harbourfield.com`, `northaxle.com` and
   `verdantdental.com`; any other company gets no guesses, and estimates that
   say they have nothing to stand on.

   Be aware of what that mix means: the panel is live but these guesses are
   not, so a guess may mention something the panel never showed. We get away
   with it only because a guess is clearly marked as junior work — a dashed box
   labelled `estimated`, sitting next to a field the user can overrule — and
   only for the length of one card.

   Nothing here may put a guessed workflow, department or "operating model"
   into the PANEL. That kind of guessing is what made the old research agent
   untrustworthy. The panel shows only what we can point at; everything else
   comes from the questions. */
const DEMOS = {
  /* Dr. Job Pro (drjobpro.com) is the demo we actually give, so nothing here is
     invented: every line was read off their live site. The v17 prototype had
     two lines that went past the evidence — "60–80 staff across sales, support
     and operations" and "support arrives on all three" — and they are gone.
     They named departments and workflows their own sources never showed. */
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

/* Cuts whatever the user typed in the Website field down to the key `DEMOS`
   uses: `https://www.DrJobPro.com/about` and `drjobpro.com` are the same
   company.

   An empty field, or a domain we have no entry for, falls back to the demo
   company. That is what lets you click Next, Next, Next through the whole flow
   without typing — which is how the demo is actually given.

   `/v2?scan=none` is the way into the "we know nothing about this company"
   state. Since LYR-199 it no longer hides the panel — the panel is live now
   and there are no canned facts left to hide — but it still switches off the
   canned guesses and estimates, which is what it was really for. */
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

/* Takes the shared question and lays anything we know about this company over
   the top of it. A company with no entry in `DEMOS` keeps the generic example
   text and gets no `guess` at all — the guess box only appears when there is
   one. Pain points four and beyond never get a guess, for any company. */
const painFor = (demo, i) => ({
  ...(PAINS[i] || EXTRA_PAIN),
  ...((PAINS[i] && demo && demo.pains[i]) || {}),
})
const quantFor = (demo, i) => ({
  ...QUANT[i],
  ...((demo && demo.quant[i]) || {}),
})

/* A report needs at least two pain points to hold up. We say so in the
   wording; we never disable the button. */
const MIN_PAINS = 2

/* How wide the questions are on their own, and how wide the page gets when the
   scan panel sits beside them. With no panel, the questions take the whole
   width and centre, instead of hugging one side with empty space next to
   them. */
const COLUMN = '41rem'
const COLUMN_PLUS_PANEL = '66rem'

const emptyPain = () => ({
  text: '',
  quant: QUANT.map(() => ({ mode: 'exact' })),
  team: '',
  worst: '',
  guessOpen: true,
})

/* A pain point only counts once it has a name. A card the user opened and left
   blank is not counted towards the minimum, and is not sent to the reveal
   screen. */
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

/* Turns a source URL into something a person can read: the domain, plus enough
   of the path to tell an about page from a careers page. Very long job-board
   URLs get cut short rather than wrapping and breaking the panel's shape. The
   link still opens the full URL — that is the part that has to be true. */
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

/* What the research found, shown beside the questions rather than in front of
   them. It only ever shows things it can point at, and it never fills in an
   answer for the user.

   Three cases, and the third is the important one: findings appear one by one
   as they arrive; while the search is still running it says so quietly; and if
   nothing at all was found, the panel does not appear. An empty panel looks
   broken, and a panel that promises a scan it cannot deliver is worse than no
   panel (LYR-185).

   No sorting, no limit, no "show a mix of types" rule. The agent already decided
   what is worth saying and wrote each line. A second round of picking here would
   quietly throw away that thinking, and cutting the list short would drop
   findings for no reason the prospect can see. We print `says` exactly as
   written and use `link` as the link. This component calls no model and makes no
   decisions of its own (LYR-199). */
function ScanPanel({ company, findings, looking }) {
  /* Nothing found means nothing on screen, not an empty box. Once the search
     is finished and found nothing, the panel disappears — the questions are
     the whole product without it. */
  if (findings.length === 0 && !looking) return null
  return (
    <aside
      /* The label is what keeps this a landmark for screen readers. An <aside>
         with no label inside a <section> is announced as a plain box, not as a
         side panel. */
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
      {findings.map((f, i) => (
        <ScanFactRow
          /* The agent may say more than one thing about one page, so the link
             alone is not a key. */
          key={`${f.link}\n${f.says}`}
          stacked
          fact={f.about}
          value={f.says}
          source={sourceLabel(f.link)}
          sourceUrl={f.link}
          last={!looking && i === findings.length - 1}
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

/* One pain point per screen, in the order that keeps the answers honest: the
   open question comes first and is answered first, our guess sits under it in
   a dashed box that clearly looks like junior work, and only then do we ask
   for numbers. Nothing here pre-fills the big text box. A suggestion the user
   has to accept is data; a suggestion already sitting in the field is us
   putting words in their mouth. */
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
  /* Is the panel on screen? The page width depends on this. We used to check
     `demo` instead, which worked while the panel was canned, but not now that
     it is live research. So a search that ends up finding nothing will
     re-centre the questions once, the moment we learn there is nothing. The
     alternative is an empty gap beside the questions for the rest of the
     session. */
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

        {/* The main box. No label above it — the question is the label. */}
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

        {/* TODO(agent) — the pain point text above, plus these two, are free
            writing, and nothing reads them today beyond showing them back.
            They are where the shape of the work, the size of the team and the
            tone of the final report should come from. Same rule as the
            numbers: an agent has to read them, not us. */}
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

/* Said once, above the figures, whenever a blank answer was filled in with the
   estimate we showed during the questions. The purple dots next to the numbers
   let you trace them; this sentence is the plain admission. It deliberately
   does not promise an edit button, because this screen does not have one
   yet. */
const OURS_NOT_YOURS =
  'You left the numbers to me, so these are my guesses standing in — marked as mine, and worth replacing with your own before this goes in front of anyone.'

const comma = (n) => Math.round(n).toLocaleString('en-US')
const money = (n) => `$${comma(n)}`

/* Takes one pain point's five number answers, reads them with answerBridge,
   and runs the calculator on them.

   `estimates` is the five estimate strings we showed this company during the
   questions (quantFor(demo, i).estimate). answerBridge uses one of them
   whenever the matching question was left blank. That is what makes the
   click-through demo show real figures instead of "not enough here yet".
   Anything filled in that way is flagged as an estimate and marked on screen
   as ours — never passed off as the user's own number.

   annualHours (hours spent per year) never looks at pay or at how much can be
   automated. It is only people × hours a week × the calculator's own 50
   working weeks. So a pain point missing only pay can still show hours spent.
   The money side is what we hold back — we never make a number up. A pain
   point missing people or hours a week has nothing to show at all. */
function figuresFor(pain, estimates) {
  const fields = bridgePainQuant(pain.quant, estimates)
  const assembled = assembleCalculatorInput(fields, pain.team || undefined)

  if (!assembled.incomplete) {
    return { complete: true, calc: calculateMiniProfitMap(assembled) }
  }
  if (fields.people.value === null || fields.hoursPerWeek.value === null) {
    return { complete: false, calc: null }
  }
  const calc = calculateMiniProfitMap({
    people: fields.people.value,
    hoursPerWeek: fields.hoursPerWeek.value,
    annualPay: 0,
    automatablePct: 0,
  })
  return { complete: false, calc: { annualHours: calc.annualHours } }
}

/* Picks which pain point to show on the reveal screen (LYR-188). The rules run
   in order: biggest money figure wins; if two tie, more hours returned wins;
   if they still tie, whichever the user entered first wins. Nothing random and
   no model call, so the same answers always pick the same pain point, and we
   can unit-test the choice.

   A pain point with missing numbers always loses to one with complete numbers,
   even if its partial hours figure happens to be bigger. A number with less
   behind it should never beat a number with more behind it just because it
   looks larger. */
function selectFeatured(pains, estimates) {
  return pains
    .map((pain, index) => ({
      pain,
      index,
      figures: figuresFor(pain, estimates),
    }))
    .sort((a, b) => {
      if (a.figures.complete !== b.figures.complete)
        return a.figures.complete ? -1 : 1
      if (a.figures.complete && b.figures.complete) {
        const gain =
          b.figures.calc.totalFinancialGain - a.figures.calc.totalFinancialGain
        if (gain !== 0) return gain
        const hours =
          b.figures.calc.hoursReturned - a.figures.calc.hoursReturned
        if (hours !== 0) return hours
      }
      return a.index - b.index
    })[0]
}

/* `demo` is handed in from above rather than looked up here. If the user left
   one of our estimates standing, the only honest thing to check it against is
   the exact entry the questions actually showed them.

   Piece 2 (LYR-188 / POC 10): the real figures for the chosen pain point.
   Piece 3: the sentence above them — the "I heard you" moment — built by
   buildObservationSentence() from the same numbers the figures came from,
   never by a model. The final pitch styling is a later piece. */
function Reveal({ flow, demo, onRestart }) {
  // Every pain point can still be thrown away on the way in: blank, with no
  // guess to fall back on (open /v2?scan=none, name nothing, click finish). So
  // there may be nothing to show. In that case we fall into the same
  // empty-handed screen a pain point with no numbers reaches, instead of
  // reading fields off a value that isn't there and crashing.
  const estimates = QUANT.map((_, i) => quantFor(demo, i).estimate)
  const featured = selectFeatured(flow.pains, estimates)
  const pain = featured ? featured.pain : null
  const figures = featured ? featured.figures : { complete: false, calc: null }
  const fields = bridgePainQuant(pain?.quant, estimates)
  const observation = buildObservationSentence(
    fields.people,
    fields.hoursPerWeek,
    figures.calc ? figures.calc.annualHours : null,
  )
  // Hours spent goes unmarked only while it is built from the user's own
  // answers. If either number behind it came from one of our estimates, it
  // carries a guess and has to say so. That mark is what keeps "we never
  // invent a number" true once our estimates are doing the talking.
  const hoursAreOurs =
    fields.people.source === 'estimate' ||
    fields.hoursPerWeek.source === 'estimate'

  // Piece 4: the pop-up that shows how the money figure was worked out. The
  // Escape-to-close code lives here, not in the shared Dialog component,
  // because Dialog has no Escape handling of its own (and neither does its
  // only other user, pages/ui-kit.jsx).
  const [formulaOpen, setFormulaOpen] = React.useState(false)
  React.useEffect(() => {
    if (!formulaOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setFormulaOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [formulaOpen])

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

      <p style={{ ...LEAD, margin: 'var(--space-3) 0 var(--space-8)' }}>
        {observation}
      </p>

      {hoursAreOurs && <p style={LEAD}>{OURS_NOT_YOURS}</p>}

      {!figures.calc && (
        <p style={LEAD}>
          Not enough here yet to put a number on it — go back and answer at
          least how many people do this and how many hours a week.
        </p>
      )}

      {figures.calc && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-8)',
            margin: '0 0 var(--space-8)',
          }}
        >
          {/* The first figure: hours currently SPENT. It comes straight from
              the user's own answers. Never call it "hours back", "hours
              returned" or "hours saved", and never mark it, because it holds
              no guess beyond what was typed. */}
          <div>
            <p style={FIGURE_LABEL}>Hours currently spent</p>
            <p style={FIGURE_VALUE}>
              {comma(figures.calc.annualHours)}
              <span style={FIGURE_UNIT}>hrs / year</span>
              {/* Only shown when there is a pop-up to open. The dot exists so
                  you can trace the number; a dot that opens nothing is just
                  decoration. In practice every run built on our estimates has
                  complete figures, so this changes nothing in the demo. */}
              {hoursAreOurs && figures.complete && (
                <ProvenanceMark
                  kind="estimated"
                  onClick={() => setFormulaOpen(true)}
                />
              )}
            </p>
          </div>

          {figures.complete ? (
            <div>
              <p style={FIGURE_LABEL}>Hours returned, and what that’s worth</p>
              <p style={FIGURE_VALUE}>
                {comma(figures.calc.hoursReturned)}
                <span style={FIGURE_UNIT}>hrs / year</span>
              </p>
              <p style={{ ...FIGURE_VALUE, marginTop: 'var(--space-2)' }}>
                {money(figures.calc.totalFinancialGain)}
                {/* This one holds our guesses about how much can be
                    automated, how many people will use it, and how much of the
                    saving really lands. Clicking it opens the pop-up below. */}
                <ProvenanceMark
                  kind="estimated"
                  onClick={() => setFormulaOpen(true)}
                />
              </p>
            </div>
          ) : (
            <p style={LEAD}>
              We don’t have enough here yet to put a return number on this one —
              pay and how much still needs a person are missing.
            </p>
          )}
        </div>
      )}

      {/* The formula pop-up (LYR-188 / POC 10, piece 4). You can only reach it
          when the figures are complete — that is the only case where the
          formulas exist and the dot that opens it is drawn. We check again
          here so that a pop-up left open from before can never try to read
          formulas that are not there. */}
      {figures.complete && (
        <Dialog
          open={formulaOpen}
          onClose={() => setFormulaOpen(false)}
          title="How this number was calculated"
          description="Straight from the calculator — nothing rounded differently here than what's shown above."
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
            }}
          >
            {FORMULA_ROWS.map((row) => (
              <div key={row.key}>
                <p style={{ ...FIGURE_LABEL, margin: '0 0 var(--space-1)' }}>
                  {row.label}
                </p>
                <p
                  style={{
                    font: 'var(--type-body)',
                    color: 'var(--text-heading)',
                    margin: 0,
                  }}
                >
                  {figures.calc.formulas[row.key]}
                </p>
              </div>
            ))}
          </div>
        </Dialog>
      )}

      <Button variant="secondary" onClick={onRestart}>
        Start over
      </Button>
    </section>
  )
}

const emptyFlow = () => ({
  step: 'landing',
  company: { name: '', website: '' },
  /* The website as it was when the form was submitted. The research call is
     tied to this, not to `company.website`, so that typing in the field does
     not start a new research run on every keystroke. */
  scanFor: '',
  turn: 0,
  pains: [emptyPain()],
})

/* Where the scan panel's data comes from (LYR-199).

   We open one long-lived connection to the server when the company form is
   submitted, and we never wait for it. The server keeps it open and pushes
   findings down it one at a time as it finds them. The questions appear
   immediately, and each finding is added when it arrives — so one slow search
   costs us one row, not the whole panel.

   We use the browser's built-in `EventSource` rather than reading the response
   ourselves, because this request has one parameter and writing our own reader
   would be more code for the same result. The one thing `EventSource` does
   that we do not want is reconnect automatically when the server hangs up.
   A reconnect here means a second research run — the same crawling and the
   same model calls, paid for twice. So we close the connection ourselves, both
   when the server says it is done and when it errors.

   A website we cannot turn into a domain is rejected by the server, which the
   browser reports as an error. The panel then stops looking and, having found
   nothing, draws nothing. That is the right outcome for a company we know
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
        return /* a broken message costs its own row, never the whole panel */
      }
      if (event.type === 'done') {
        stop()
        return
      }
      /* The server already throws away any finding pointing at a page it did
         not open, so a missing link should be impossible. We check again
         anyway: if it ever did happen we would print a line with no source
         under it, which is the exact thing this panel promises never to do.
         No link, no row.
         Other event types — `step` and `gaps` — are ignored here for now. */
      if (event.type !== 'finding' || !event.finding?.link) return
      setScan((current) => ({
        ...current,
        findings: [...current.findings, event.finding],
      }))
    }
    stream.onerror = stop

    /* If the user leaves /v2 while a search is running, we must close the
       connection. Otherwise it keeps trying to update a page that is gone.
       Closing is also how the server knows to stop working: the client
       hanging up is its stop signal. */
    return () => stream.close()
  }, [website])

  return scan
}

export default function V2() {
  const [flow, setFlow] = React.useState(emptyFlow)
  /* `/v2?scan=none` switches off the canned guesses and estimates. It needs its
     own way in, because a domain we do not recognise now falls back to the
     demo company instead. */
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

  /* Moving between pain points is not a new step — we are still on
     `interview`. A pain point the user has not reached yet gets a fresh blank
     set of answers added. One they have already visited is left exactly as
     they left it. */
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
              /* We start the research call and move on immediately. The
                 questions appear at once and the panel fills in behind
                 them. */
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
            /* Worked out from the website field every time we draw, rather
               than copied into `flow`. One source of truth — and it means
               going back and editing the website automatically picks a
               different company. */
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
            /* Going back costs nothing and loses nothing: earlier pain points
               stay in `pains`, so returning to one shows what was typed. */
            onBack={() => (flow.turn > 0 ? goTurn(flow.turn - 1) : go(-1))}
            onAdd={() => goTurn(flow.turn + 1)}
            /* A pain point left blank falls back to the guess we showed for
               it, flagged so the reveal screen can say whose words they are. A
               blank one with no guess to fall back on is thrown away. That is
               where an empty pain point stops — not at the finish button,
               which never blocks. We do this here, on the way out, so that
               going back to a blank card still shows it blank. */
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
