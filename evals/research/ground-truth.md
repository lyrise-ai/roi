# Ground truth for reading the analyst's findings

The research analyst (LYR-216) replaced a verb-set intersection with an agent
that reasons over what the scouts found. **There is deliberately no before/after
number** — the old metric was produced by the very list that card deleted, and
the new output is non-reproducible by design. Comparing them would be theatre.

So the check is a human one: run `npm run eval:research`, then read the findings
and judge each against three questions.

1. **Is it true?**
2. **Is it specific to that company** — or could it be said of any firm in the
   segment?
3. **Would the prospect be mildly impressed we knew it?**

This file is what makes question 1 answerable without re-researching each firm
mid-review. Everything below was gathered independently of the pipeline, from
public sources, before the analyst ran. Where it disagrees with the analyst,
**this file is not automatically right** — it is a prior, and a finding that
contradicts it is worth opening the cited URL for.

Baseline run: `results.json`, 2026-08-20 (pre-analyst — the tiers below come
from the deterministic `confidenceTier`, which the analyst may now override).

---

## The four failure modes to hunt for

The baseline already hints at each. These are what to look for, not a
prediction that they will happen.

| Mode                                         | Where it is most likely                                                         | What it looks like                                                                                                                                                                                                             |
| -------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Wrong entity**                             | `bakertilly.com`                                                                | The baseline returned Dutch task verbs (`beoordelen`, `ondersteunen`, `vertalen`, `beheren`) for a firm whose domain is Baker Tilly **US**. Any finding about Dutch-language roles is true of _a_ Baker Tilly, not _this_ one. |
| **Page mistaken for a job**                  | `alsuwaidi.ae`, `hadefpartners.com`, `bsabh.com`, `farrer.co.uk`, `hlbhamt.com` | These scored on a careers _page_, with zero real postings. LYR-211 marked the page as `kind: 'page'`; the analyst is told so. A finding that says "you're hiring for X" off a page with no vacancies is the overclaim.         |
| **Application-process verbs read as duties** | `stevens-bolton.com`                                                            | Baseline verbs were `apply` / `attend` / `be involved` / `contact` — that is the _how to apply_ box, not anybody's job.                                                                                                        |
| **Generic prose**                            | `mishcon.com`, `gowlingwlg.com`                                                 | Baseline verbs `align` / `plan` / `track` and `give` / `have` / `pass` / `share`. Nothing in those distinguishes a law firm from a garden centre.                                                                              |

---

## Per-firm ground truth

### GCC

**tamimi.com** — Al Tamimi & Company · baseline MODERATE, 6 postings via search

The largest non-affiliated law firm in the Middle East: ~330 lawyers, 16 offices
across 9 countries (UAE, Egypt, Jordan, Kuwait, Morocco, Qatar, Saudi Arabia).
Runs a real careers site at `tamimi.com/careers/` and posts to GulfTalent,
Indeed AE, Glassdoor (~15 open roles) and LinkedIn.

Their paralegal role is publicly described as supporting _"Associates, Senior
Associates and Partners in handling cases and preparing for hearings, trials and
meetings"_ — which is exactly the automatable material this product is for.

⚠️ The baseline's top verbs were `copy` / `direct` / `edit` / `enhance`. Those
read like a marketing or content role, not a paralegal one. **Check whether the
six postings retrieved are actually legal roles**, or whether search pulled the
firm's business-services jobs and the analyst then generalised from them.

**alsuwaidi.ae** — Alsuwaidi & Company · baseline RICH, **0 postings, 1 page**

Full-service commercial firm founded 1997; offices in Dubai, Abu Dhabi, Ajman.
UAE's only member of the MULTILAW network. Known publicly for high employee
retention.

Its careers page says only that they are _"always interested to hear from the
leaders of tomorrow"_ and invites interns and graduates to get in touch. **There
is no vacancy list.** The baseline's verbs (`conduct`, `draft`, `handle`,
`liaise`) almost certainly came from practice-area prose, not a job description.

⚠️ **This is the single best overclaim test in the set.** It scored RICH on a
page with no jobs on it. Any analyst finding of the form "you are hiring…" here
is false. A good finding would be about the practice mix or the MULTILAW
membership, cited to a page that actually says so.

**galadarilaw.com** — Galadari Advocates & Legal Consultants · baseline RICH, 2 postings

Dubai firm operating since 1983; offices in Dubai, Abu Dhabi and DIFC. Mixed
Emirati and internationally qualified lawyers. Work spans Corporate, Real Estate
and Dispute Resolution. Runs an early-careers programme and, as part of
Emiratisation, offers internships and training contracts to Emirati law students
and graduates.

Baseline verbs `advise` / `draft` / `handle` / `liaise` are plausible duty verbs
for a real role. **`advise` should not be counted as automatable** — the prompt
tells the analyst that professional judgement stays out. Worth checking it
obeyed.

**pkfuae.com** — PKF UAE · baseline RICH, 1 posting

Formed in Dubai 1976; one of the largest independent audit and accounting firms
in the UAE. **7 partners, 250+ staff**, four partners on audit and assurance,
the rest across company formation, risk advisory, tax, accounting and corporate
finance. Approved auditors in Dubai, Abu Dhabi and Sharjah. Careers at
`pkfuae.com/career-opportunities/`.

Baseline verbs `allocate` / `arrange` / `follow up` / `liaise` are genuinely
back-office and genuinely automatable. The size figures above are checkable, so
any headcount claim can be verified exactly.

**hlbhamt.com** — HLB HAMT · baseline MODERATE, 0 postings, 1 page

Established UAE 1999; **seven offices** — Abu Dhabi, Dubai, Sharjah, SAIF Zone,
Jebel Ali, Fujairah, RAK Free Zone. Audit, accounting, payroll, incorporation,
consultancy.

They **do** have live vacancies — Auditor (qualified/semi-qualified
CA/CPA/CMA/ACCA/CIA, 3–5 yrs) and IT Auditor (3–4 yrs, auditing IT
infrastructure, security protocols, business systems, UAE regulatory
compliance) — carried on GulfTalent, Indeed AE and Glassdoor.

⚠️ **We found none of them.** Their careers pages are `/careers-at-hlb-hamt/`
and `/career/` — neither matches the `/careers`, `/careers/vacancies`,
`/careers/jobs` shapes S2 probes. This is a **retrieval gap, not an empty
company**, and it is evidence for LYR-213.

**stalawfirm.com** — STA Law Firm · baseline THIN, nothing retrieved

Multi-service firm, principal office Dubai, plus Abu Dhabi, Sharjah, RAK,
Fujairah and overseas in London, Luxembourg, Moscow, Doha, Delhi, Lisbon,
Bahrain. 51–200 employees.

⚠️ **The LYR-210 commit recorded this domain as "genuinely unreachable". That is
wrong, and worth correcting.** Probed directly:

```
https://stalawfirm.com/                        301  20.1s → www.stalawfirm.com
https://www.stalawfirm.com/en/careers.html     200  17.8s
```

The site answers. It is simply _very slow_ — the apex redirect alone eats 20s of
a 20s S2 budget — and its careers page sits at `/en/careers.html`, a shape S2
never probes: a **language prefix** and a **`.html` extension**. Two independent
retrieval gaps, both fixable, neither a fact about the company.

THIN is still the right output today, because we genuinely did not read
anything. The analyst must stay silent here. **If it produces any finding about
STA, that is a fabrication** — there are no sources to cite.

### UK

**mishcon.com** — Mishcon de Reya · baseline RICH, 6 postings

Recruits paralegals **on a rolling basis** rather than in intakes; paralegal
median total pay ~£31k. Hires well beyond law — finance, business development,
data science, risk and compliance, technology. 2026 vacation schemes run in four
blocks across April, May, June and July.

⚠️ Baseline verbs were `align` / `plan` / `track` — generic. The rolling-basis
paralegal detail and the non-legal hiring breadth are the specific, checkable
things here. **If the analyst produces something that would read identically for
any London firm, that is the "generic prose" failure**, even though the
underlying postings are real.

**stevens-bolton.com** — Stevens & Bolton LLP · baseline RICH, 5 postings

Independent UK firm, **280 people including 90 lawyers, all in one building in
Guildford**. Around 10 trainees a year, mostly from vacation schemes.

Real current vacancies: Knowledge Lawyer / Senior Knowledge Lawyer (Tax &
Trusts), Senior Associate – Corporate, Associate/Senior Associate – Commercial.

⚠️ Baseline verbs `apply` / `attend` / `be involved` / `contact` are the
application instructions, not duties. **Good finding:** the Knowledge Lawyer
role, or the single-office 280/90 split. **Bad finding:** anything built on
"they do a lot of applying and attending".

**charlesrussellspeechlys.com** — baseline THIN, nothing retrieved

⚠️ Genuinely blocked, unlike STA. Probed directly:

```
https://www.charlesrussellspeechlys.com/        403  0.2s
https://charlesrussellspeechlys.com/en/careers/ 403  0.8s
```

Fast, deliberate WAF refusal on both apex and careers path. This is what the
Firecrawl tier exists for. THIN is honest. **The analyst must stay silent.**

### US

**morganlewis.com** — Morgan, Lewis & Bockius · baseline RICH, 6 postings

**2,200+ lawyers and legal professionals.** ATS is Workday
(`morganlewis.wd5.myworkdayjobs.com`). Runs a named programme — **ML LawPath®**
— for Legal Practice Assistants giving administrative and substantive support to
specific practice groups, hybrid, two-year commitment, 2026 cohort starting no
later than 29 June 2026.

Baseline verbs `attend` / `conduct` / `draft` are real duty verbs. **ML LawPath®
is the kind of detail that earns the "mildly impressed" answer** — named,
dated, unambiguously theirs. If the analyst found it, that is the standard the
rest should be judged against.

**bakertilly.com** — Baker Tilly · baseline RICH, 12 postings via direct ATS

Baker Tilly **US**, LLP: advisory CPA firm, coast-to-coast plus international
financial centres including Chicago. Its advisory work is publicly described by
process name — **outsourced CFO/Controllership, Record-to-Report,
Procure-to-Pay, Order-to-Cash, FP&A, Financial Reporting**. That vocabulary is
the richest automation material of any firm in the set.

⚠️ **The baseline returned Dutch verbs**, which means the ATS we reached is
Baker Tilly Netherlands. Same global network, different firm, different
country, different roles. **Any finding here needs its country checked before
it counts as true.** Getting the wrong national member firm is the most
embarrassing available failure, because every word of it will look right.

---

## How to record the read

For each firm: the finding, then true / specific / impressive as yes-no-partly,
then one line of why. A finding that fails any of the three is worth a sentence
on _which_ failure mode it is, using the table above.

Post the write-up to LYR-187. Anything that turns out to be a retrieval gap
rather than an analyst problem — `hlbhamt.com`'s `/career/` path,
`stalawfirm.com`'s `/en/*.html` and its latency — belongs on LYR-213 instead,
which is the card for exactly that question.
