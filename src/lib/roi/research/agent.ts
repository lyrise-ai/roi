// ─────────────────────────────────────────────────────────────────────────────
// agent — the whole research system. One agent, five tools, one answer.
//
// What this replaces: a fixed running order (S1, then S2, and inside S2 five
// tiers tried one after another), plus a second model call afterwards that read
// what the first part collected and worked out what it meant.
//
// Every retrieval bug we had was the same bug. A hardcoded guess about how other
// people build their websites, one character off. `/careers` did not match
// `/career/`. An eight-character rule threw away a six-character path. Each fix
// was a better guess, which is the same bug put off until next time.
//
// It did not save money either. When a guess is wrong the old code did not stop
// — it ran every remaining step and spent the whole budget finding nothing.
// About six wasted page loads for a company we then called empty.
//
// So the agent decides where to look. It reads the homepage we hand it, picks
// the tools it wants, sees WHY a call failed, and stops when it has enough.
//
// ── Three things hold it honest ──────────────────────────────────────────────
//
//   Writing a finding down is a tool call, and that tool refuses any link we did
//   not really open. Not a prompt instruction — an `if`. Tools make inventing
//   MORE tempting, not less: after three calls the agent holds half a picture
//   and half feels like enough.
//
//   Nothing here throws. Every failure comes back as a sentence the agent can
//   act on, and then as a sentence the person can read. A blank section in a
//   report and "we could not reach your site" are different answers.
//
//   Counting stays in code. The agent groups adverts by role, because knowing
//   that "Senior Paralegal (Dubai)" and "Paralegal - 2 positions" are one job is
//   judgement. `countRepeats` then does the arithmetic, because "twice in five
//   months" goes in front of a finance director and must be exact.
// ─────────────────────────────────────────────────────────────────────────────

import { Output, ToolLoopAgent, stepCountIs } from 'ai'
import { z } from 'zod'

import { flushPostHog } from '@/src/lib/posthog-server'
import { getAnalystModel } from '@/src/lib/roi/llm'
import { MAX_WAIT_MS, readPage, textOf } from './pages'
import { cleanDomain, declaredDomain } from './search'
import { badDomain } from './log'
import { createTools, record, rescueLeft, startRun } from './tools'
import { type Finding, type Research, EMPTY_RESEARCH, link } from './types'

/* A hard stop. Each step is one model turn: either a tool call or the final
   answer. Twenty is generous — a company that needs more than that is one we
   are not going to crack by trying harder, and the interview is waiting. */
const MAX_STEPS = 20

/* What the agent hands back at the end. Deliberately small: the findings
   already arrived one at a time through `noteFinding`, so this is only the part
   that can be judged once, at the end, with everything in view. */
const ANSWER = z.object({
  handWork: z
    .array(z.string())
    .describe(
      'What this company appears to do by hand that a system could take over, in your own words, each grounded in something you actually read. Empty if what you read does not support any.',
    ),
  gaps: z
    .array(z.string())
    .describe(
      'What you could not find out, and why, as sentences a person will read. "Their site did not answer within 15 seconds, so we could not read their careers page" — not "timeout". Empty only if you really did find everything you looked for.',
    ),
  confidence: z
    .enum(['lots', 'some', 'little'])
    .describe(
      'lots: enough specific, dated evidence to say something only this company would recognise, and to quote it. some: real but thin — the report should hedge and lean on what they tell us. little: too little to make any claim about them at all.',
    ),
})

const INSTRUCTIONS = [
  'You research one company so we can show them where their people spend time on',
  'work a system could do. You are given their homepage. Everything else you go',
  'and get yourself.',
  '',
  'WHAT IS WORTH MOST',
  'A job advert is the only place a company describes its own work, in its own',
  'words, with a date on it. "Reconcile 200+ invoices weekly". "Chase outstanding',
  'documents from clients". That is a direct read on what is being done by hand.',
  'Everything else is us working things out. Look for their open jobs first.',
  '',
  'WHEN THE JOBS ARE NOT ON THEIR OWN SITE',
  'Plenty of firms run a careers page that is only a "Search Jobs" button, with',
  'the real adverts on a jobs site instead. Those results come back marked',
  'secondHand. You may read them. But check the company name ON the page before',
  'you believe a job is theirs — those sites republish, and they are often wrong',
  "about who a posting belongs to. Attaching another firm's vacancy to this",
  'prospect is worse than finding nothing, because it looks checkable.',
  '',
  'HOW TO FIND THEM',
  'Their careers page is almost always linked from their homepage. Use findLinks',
  'with kind "careers" before you guess at addresses — the link is right there and',
  'firms name that page anything: /career, /careers-at-acme, /en/careers.html,',
  '/join-us. Once you are on a vacancy list, findLinks with kind "jobs" gets you',
  'the individual adverts, and only the adverts describe the actual work.',
  'If the homepage gives you nothing, search. Their real name in quotes works far',
  'better than their domain.',
  '',
  'WRITE THINGS DOWN AS YOU GO',
  'Call noteFinding the moment you know something. It goes on their screen',
  'straight away, while they are still answering our questions. Do not save it all',
  'for the end.',
  '',
  'YOUR FIRST MOVE IS ALWAYS A FINDING, BEFORE YOU FETCH ANYTHING',
  'You already have their homepage. Read it and call noteFinding once, pointing at',
  'the homepage address, before any other tool. Someone is watching a blank panel',
  'until you do, and every fetch after this adds seconds to that wait.',
  'Say the most concrete thing the homepage actually supports — a service they',
  'name, an office they list, a system they mention. Not "you are a law firm in',
  'Dubai": they know that, and it tells them we learned nothing.',
  '',
  'WHO IS ON THE OTHER SIDE OF THIS',
  'A person from that company is on our site right now, answering questions, with',
  'your findings appearing next to them as you write them. Not a log file, not a',
  'reviewer. Them.',
  'So two things follow. They are waiting, so do not wander — every extra fetch is',
  'time they spend looking at an unfinished panel. And they read every sentence you',
  'write, about their own business, which they know far better than you do. A vague',
  'or wrong line is not a small miss; it is the moment they stop believing any of',
  'it.',
  '',
  'WHEN A CALL FAILS, READ WHY',
  'You are always told why. Use it.',
  '  timeout      — the site is real, just slow. Read the same address again with',
  '                 waitSeconds raised (up to 45). Do that ONCE per address. If it',
  '                 times out at 45 too, that firm is too slow to research — say so',
  '                 in gaps and move on.',
  '  not-found    — there is no page there. Guessing at nearby addresses is wasted;',
  '                 look for a link or search instead.',
  '  rescue-spent — our budget for forcing difficult pages open is gone. Search',
  '                 instead of retrying.',
  '',
  'FINDING NOTHING IS A REAL ANSWER',
  'A firm that is genuinely not hiring is a fact we can say out loud. A firm whose',
  'site we never reached is a hole in what we know, and we must stay quiet about',
  'them. These are different and you must never mix them up. Say which one it was',
  'in gaps, in a sentence they will read.',
  '',
  'NEVER SAY WHAT YOU CANNOT POINT AT',
  'Every finding needs a page you actually read in this run. If you did not read',
  'it, you cannot say it — put it in gaps instead. noteFinding will refuse a link',
  'you never opened and tell you so.',
  '',
  'SAYING LESS IS HOW THIS STAYS CREDIBLE',
  'The reader knows their own business better than you do. A generic sentence',
  'tells them we learned nothing. Three specific findings beat ten vague ones, and',
  'no findings with an honest reason beats one invented finding.',
  '',
  'COUNTING',
  'If you find several adverts, group them by role yourself — strip seniority,',
  'location and reference numbers, so "Senior Paralegal (Dubai)" and "Paralegal -',
  '2 positions" are one role — then call countRepeats. A role advertised twice',
  'inside a year is the strongest thing we can say. Do not work the months out',
  'yourself; that tool exists because the number has to be exact.',
  '',
  'STOP WHEN YOU HAVE ENOUGH',
  'Enough is a handful of specific things we can point at, or an honest account of',
  'why there is nothing to find. Someone is waiting.',
].join('\n')

export type ResearchOptions = {
  /* Fires as each finding is accepted, for the side panel. */
  onFinding?: (finding: Finding) => void
  /* Fires after each turn, so a caller can show what the agent is doing right
     now — "reading their careers page" reads better than a spinner. */
  onStep?: (step: { number: number; using: string[] }) => void
}

/* Research one company. Never throws: a failed run comes back as a `Research`
   with nothing found and a reason in `gaps`, because this sits on the path that
   makes a report and nothing there is allowed to throw. */
export async function research(
  domainInput: string,
  options: ResearchOptions = {},
): Promise<Research> {
  const startedAt = Date.now()

  const domain = cleanDomain(domainInput)
  if (!domain) {
    badDomain(domainInput)
    return {
      ...EMPTY_RESEARCH,
      gaps: [`"${domainInput}" is not a web address we can look up.`],
    }
  }

  const run = startRun(domain, options.onFinding)
  run.log.start()

  /* The homepage, fetched before the agent starts rather than by it.

     Every company needs it, so making the agent spend a turn asking for it buys
     nothing. It also carries the two things that decide whether the rest of the
     run works: what the firm calls itself, and any other domain it says is its
     own. `kingsleynapley.com` serves `kingsleynapley.co.uk`, and without that
     its real careers page gets thrown away as a stranger's. */
  const homeAt = Date.now()
  let home = await readPage(`https://${domain}/`)

  /* One slow retry, before the agent gets a turn. Their homepage is the only
     thing every run needs, and `stalawfirm.com`'s apex redirect alone takes 20
     seconds — so at the ordinary limit we hand the agent nothing and it starts
     the run blind. Paying 45 seconds once, only for a site that has already
     proved it is slow rather than absent, is worth it. */
  if ('why' in home && home.why === 'timeout') {
    home = await readPage(`https://${domain}/`, MAX_WAIT_MS)
  }

  let opening: string
  if ('why' in home) {
    record(run, {
      tried: `read https://${domain}/ — their homepage`,
      got: home.why === 'timeout' ? 'timeout' : 'nothing',
      ms: Date.now() - homeAt,
      why: home.detail,
    })
    opening = [
      `Company domain: ${domain}`,
      '',
      `Their homepage could not be read. ${home.detail}`,
      '',
      'Search for them instead, or try www. if that looks like the problem.',
    ].join('\n')
  } else {
    record(run, {
      tried: `read https://${domain}/ — their homepage`,
      got: 'page',
      ms: Date.now() - homeAt,
    })
    const homeLink = link(home.url)
    if (homeLink) run.opened.add(homeLink)
    const alias = declaredDomain(home.content, domain)
    opening = [
      `Company domain: ${domain}`,
      alias ? `They also publish under: ${alias}` : '',
      `Rescue fetch budget: ${rescueLeft()}`,
      '',
      `Their homepage (${home.url}), as text. You already have this — do not read`,
      `it again. It counts as opened, so you may point findings at it.`,
      '',
      textOf(home.content).slice(0, 6_000),
    ]
      .filter(Boolean)
      .join('\n')
  }

  const agent = new ToolLoopAgent({
    model: getAnalystModel(),
    instructions: INSTRUCTIONS,
    tools: createTools(run),
    stopWhen: stepCountIs(MAX_STEPS),
    output: Output.object({ schema: ANSWER }),
    /* No `temperature` here. The model this runs on is a reasoning model and
       refuses the setting — passing it warned on every single call in the first
       live run and changed nothing.

       So two runs on one company can word things differently. What stops that
       reading as a broken product is that findings are pinned to pages we really
       opened and numbers come from `countRepeats`, not that the sentences match
       character for character. */
  })

  let steps = 0
  try {
    const result = await agent.generate({
      prompt: opening,
      onStepFinish: ({ stepNumber, toolCalls }) => {
        steps = stepNumber + 1
        const using = (toolCalls ?? []).map((call) => call.toolName)
        run.log.step(stepNumber, using)
        try {
          options.onStep?.({ number: stepNumber, using })
        } catch {
          /* A caller's broken callback must not end the run. */
        }
      },
    })

    const answer = result.output ?? {
      handWork: [],
      gaps: [],
      confidence: 'little' as const,
    }
    const found: Research = {
      findings: run.findings,
      handWork: answer.handWork ?? [],
      gaps: answer.gaps ?? [],
      /* Whatever it says, we cannot speak boldly about a company we could not
         point at even once. */
      confidence:
        run.findings.length === 0 ? 'little' : (answer.confidence ?? 'little'),
      tried: run.tried,
    }
    run.log.done(found, Date.now() - startedAt, steps)
    await flushPostHog()
    return found
  } catch (error) {
    /* The run broke part way through. Anything already written down still
       stands — those findings were checked as they were made — so we keep them
       and say what went wrong. */
    run.log.broke(error, Date.now() - startedAt, run.findings.length)
    await flushPostHog()
    return {
      findings: run.findings,
      handWork: [],
      gaps: [
        `The research stopped early: ${error instanceof Error ? error.message : String(error)}`,
      ],
      confidence: run.findings.length === 0 ? 'little' : 'some',
      tried: run.tried,
    }
  }
}
