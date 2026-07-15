// GET /api/alpha/dashboard — the only read path for alpha program metrics.
//
// alpha_feedback (and alpha_invites) are RLS-locked to service-role only —
// there are no client-facing policies (see
// supabase/migrations/20260713_000014_alpha_feedback_rebuild.sql and
// 20260705_000012_alpha_invites.sql). A client-side supabase.from(...) call
// against either table always returns zero rows. This route, running with
// the admin client server-side, is the only way to see this data at all.
//
// Every number below is wrapped in an envelope (value/unit/label/explains/
// formula/sample/caveat/confidence/healthy) instead of being a bare number.
// The reasoning lives here, once, in the code that computes it — the
// dashboard UI reads `explains`/`formula`/`caveat`/`healthy` off the payload
// rather than re-deriving or duplicating this logic in a second place where
// it could drift out of sync.

import { createRouteClient } from '@/src/lib/supabaseRouteClient'
import { getRoleForUser } from '@/src/lib/authHelpers'
import { getSupabaseAdmin } from '@/src/lib/supabaseAdmin'

// A PMF score computed from a handful of respondents is not a rough version
// of the truth, it is noise that happens to look like a percentage. 20 is a
// deliberately conservative floor. We used to withhold the score entirely
// below this floor — but a hidden number just invites people to go compute
// their own from the raw counts anyway, with none of the caveats attached.
// Instead the score always ships, tagged confidence: 'low' with a caveat
// spelling out exactly how many more responses would make it trustworthy.
// The launch readiness gate is the one place that still hard-fails below
// this floor — showing a number and being willing to act on it are two
// different bars.
const PMF_MIN_SAMPLE = 20

// Base "new issue" URL for a specific Linear team, e.g.
// https://linear.app/<workspace-slug>/team/<TEAM-KEY>/new — title and
// description are appended as query params per what_to_fix item at request
// time. Deliberately a separate env var from LINEAR_TEAM_ID (see
// pages/api/linear/triage.js): that one is the internal team UUID the
// GraphQL API needs, this one is the human-facing workspace/team slug a
// browser URL needs, and the two are not interchangeable. Read from env
// rather than hardcoded so the target team can move without a code change;
// if unset, linear_url is just null and the UI has nothing to link to.
const LINEAR_NEW_ISSUE_URL = process.env.LINEAR_NEW_ISSUE_URL

const FUNNEL_STEPS = [
  'reached_intake',
  'reached_generation',
  'reached_validation',
  'reached_report',
  'reached_survey',
]

const OPEN_TEXT_FIELDS = [
  'intake_ease_note',
  'validation_note',
  'unclear_note',
  'pmf_main_benefit',
  'pmf_improvement',
  'not_disappointed_reason',
]

function mean(values) {
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function round(value, decimals = 1) {
  if (value == null) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

// PostgREST returns an embedded to-one relation as a plain object in most
// configurations, but as a one-element array under some ambiguous-relation
// setups. Normalizing here means every call site below can treat
// row.invite / row.report as "an object or null" and nothing else.
function one(relation) {
  if (!relation) return null
  return Array.isArray(relation) ? (relation[0] ?? null) : relation
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Confidence is a pure function of sample size, not a judgment call made at
// each call site — the same three thresholds apply everywhere so "reliable"
// means the same thing on every metric on this page. It is deliberately
// separate from whether a *value* can even be computed (a 0/0 division still
// yields value: null regardless of what confidence tier the sample falls
// into).
function confidenceFromSample(sample) {
  if (sample >= 20) return 'reliable'
  if (sample >= 5) return 'building'
  return 'low'
}

// Every computed number in this payload is wrapped the same way so the UI
// never has to re-derive what a number means or duplicate this logic.
// `sample` is mandatory: a number with no stated sample size invites a
// reader to treat 3 respondents and 300 the same way. `healthy` is a static,
// direction-only hint ("which way is good") and stays null for metrics where
// that judgment doesn't apply — a plain count of testers isn't "healthy" or
// "unhealthy", it just is what it is.
function metric({
  value,
  unit,
  label,
  explains,
  formula,
  sample,
  caveat = null,
  healthy = null,
}) {
  return {
    value,
    unit,
    label,
    explains,
    formula,
    sample,
    caveat,
    confidence: confidenceFromSample(sample),
    healthy,
  }
}

// ── "Real tester" ────────────────────────────────────────────────────────
//
// A row in alpha_feedback is created for every session that starts the alpha
// tour, including our own team clicking through it to test a change, and
// including sessions where the invite was later revoked (e.g. someone who
// left, or a link generated by mistake). None of that is a real tester.
//
// We deliberately gate this on the *invite* (a live, non-revoked
// alpha_invites row) rather than on the feedback row's own email, because
// alpha_feedback has no email column of its own by design — identity is
// always joined from alpha_invites, never duplicated onto the feedback row
// (see the rebuild migration's comment on why). Checking "does this email
// look internal" against free-text would also be gameable and wouldn't
// catch a revoked invite; checking the invite itself catches both an
// internal email *and* a tester whose access has since been pulled, with
// one condition.
//
// reached_intake=true is also required: a feedback row can exist with every
// field null if a session started and immediately abandoned before the tour
// rendered anything. That's not a tester who gave us signal, it's a blip.
function isRealTester(row) {
  const invite = one(row.invite)
  if (!invite) return false
  if (row.invite_id == null) return false
  if (invite.revoked_at != null) return false
  if (typeof invite.email !== 'string') return false
  if (invite.email.toLowerCase().endsWith('@lyrise.ai')) return false
  return row.reached_intake === true
}

function furthestStep(row) {
  for (let i = FUNNEL_STEPS.length - 1; i >= 0; i--) {
    if (row[FUNNEL_STEPS[i]] === true) {
      return FUNNEL_STEPS[i].replace('reached_', '')
    }
  }
  // Unreachable for a real tester (reached_intake is required to qualify),
  // kept only so this function can never return undefined.
  return 'intake'
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabase = createRouteClient(req, res)
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const { role } = await getRoleForUser(user.id)
  if (role !== 'EMPLOYEE') {
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const supabaseAdmin = getSupabaseAdmin()

  const { data: feedbackRows, error: feedbackError } = await supabaseAdmin
    .from('alpha_feedback')
    .select(
      `
      id,
      created_at,
      invite_id,
      report_id,
      reached_intake,
      reached_generation,
      reached_validation,
      reached_report,
      reached_survey,
      intake_ease,
      intake_ease_note,
      trust_before,
      trust_after,
      validation_note,
      report_clarity,
      unclear_reason,
      unclear_note,
      pmf_disappointed,
      pmf_main_benefit,
      pmf_improvement,
      not_disappointed_reason,
      intent_timeline,
      invite:alpha_invites ( email, full_name, revoked_at ),
      report:reports ( id, company_name, validation_data )
    `,
    )
    .not('invite_id', 'is', null)

  if (feedbackError) {
    res.status(500).json({ error: feedbackError.message })
    return
  }

  const realTesterRows = (feedbackRows ?? []).filter(isRealTester)
  const totalTesters = realTesterRows.length

  // ── 1. TESTERS ────────────────────────────────────────────────────────
  // Who counts as a real tester, one row per person, with enough identity
  // (email, name, company) to actually follow up with them — this is the
  // list a human reads to go say "hey, thanks for testing this" or "let's
  // debug why you dropped off after intake".
  const testerRows = realTesterRows.map((row) => {
    const invite = one(row.invite)
    const report = one(row.report)
    return {
      email: invite.email,
      full_name: invite.full_name ?? null,
      company_name: report?.company_name ?? null,
      step_reached: furthestStep(row),
      created_at: row.created_at,
    }
  })

  // ── 2. FUNNEL ─────────────────────────────────────────────────────────
  // Each reached_* flag is written independently by whichever page the
  // tester actually reaches (see alpha_feedback_rebuild migration), so a
  // broken write to one step can't silently take down another. That also
  // means these counts are NOT derived from one "furthest step" value — a
  // tester could in principle have reached_report=true and
  // reached_validation=false if the validation write failed. Because each
  // step can only be reached by passing through the step before it in the
  // actual product flow, the counts must come out non-increasing
  // (intake >= generation >= validation >= report >= survey). If they
  // don't, that is not a rounding quirk — it means a write to an earlier
  // flag silently failed for at least one tester (this happened for real:
  // the old dashboard once showed 89% "generated" against 78% "intake",
  // which is not a possible funnel and meant the intake flag write had
  // failed without anyone noticing). We check for that here and surface it
  // instead of quietly rendering an impossible funnel.
  const funnelCounts = Object.fromEntries(
    FUNNEL_STEPS.map((step) => [
      step,
      realTesterRows.filter((row) => row[step] === true).length,
    ]),
  )

  let funnelIntegrityWarning = null
  for (let i = 1; i < FUNNEL_STEPS.length; i++) {
    const prevStep = FUNNEL_STEPS[i - 1]
    const step = FUNNEL_STEPS[i]
    if (funnelCounts[step] > funnelCounts[prevStep]) {
      funnelIntegrityWarning = `${step} (${funnelCounts[step]}) is greater than ${prevStep} (${funnelCounts[prevStep]}). These are independent booleans set in the order a tester actually progresses through the product, so a later step can never legitimately outnumber an earlier one. Treat every funnel count below as unreliable until this is investigated — most likely a write to the earlier flag failed silently for one or more testers.`
      break
    }
  }

  const funnel = {
    integrity_warning: funnelIntegrityWarning,
    reached_intake: metric({
      value: funnelCounts.reached_intake,
      unit: 'count',
      label: 'Reached intake',
      explains:
        'How many real testers got at least as far as the intake step. By definition this equals the total tester count, since reaching intake is part of what makes a row count as a real tester at all.',
      formula: 'count of real testers with reached_intake = true',
      sample: totalTesters,
      caveat: funnelIntegrityWarning,
    }),
    reached_generation: metric({
      value: funnelCounts.reached_generation,
      unit: 'count',
      label: 'Reached generation',
      explains:
        'How many real testers got as far as report generation. Compare against reached_intake to see drop-off between signing up and actually generating a report.',
      formula: 'count of real testers with reached_generation = true',
      sample: totalTesters,
      caveat: funnelIntegrityWarning,
      healthy:
        'should stay close to reached_intake — a big drop here means testers abandon between intake and generation',
    }),
    reached_validation: metric({
      value: funnelCounts.reached_validation,
      unit: 'count',
      label: 'Reached validation',
      explains:
        "How many real testers got as far as the validation wizard (confirming/correcting the AI's workflow assumptions).",
      formula: 'count of real testers with reached_validation = true',
      sample: totalTesters,
      caveat: funnelIntegrityWarning,
      healthy:
        'should stay close to reached_generation — a big drop here means testers abandon before validation',
    }),
    reached_report: metric({
      value: funnelCounts.reached_report,
      unit: 'count',
      label: 'Reached report',
      explains: 'How many real testers made it to the finished report page.',
      formula: 'count of real testers with reached_report = true',
      sample: totalTesters,
      caveat: funnelIntegrityWarning,
      healthy:
        'should stay close to reached_validation — a big drop here means testers abandon before seeing the report',
    }),
    reached_survey: metric({
      value: funnelCounts.reached_survey,
      unit: 'count',
      label: 'Reached survey',
      explains:
        'How many real testers completed the closing PMF survey. This is also the ceiling on the PMF sample size below.',
      formula: 'count of real testers with reached_survey = true',
      sample: totalTesters,
      caveat: funnelIntegrityWarning,
      healthy:
        'should stay close to reached_report — a big drop here means testers see the report but skip the survey',
    }),
  }

  // ── 3. MODEL ACCURACY ─────────────────────────────────────────────────
  // Source of truth: reports.validation_data, joined via each real tester's
  // report_id. One report per tester (a report can only be linked to one
  // alpha_feedback row at a time via report_id), so "unique reports among
  // real testers" and "real testers who reached a report" are the same
  // population here.
  const reportsById = new Map()
  for (const row of realTesterRows) {
    const report = one(row.report)
    if (report?.id && !reportsById.has(report.id)) {
      reportsById.set(report.id, report)
    }
  }
  const linkedReports = [...reportsById.values()]

  // baseline.source tells us whether validation_data.baseline was captured
  // *before* the tester touched anything ('generation') or reconstructed
  // after the fact ('finalize-fallback', for reports created before this
  // instrumentation existed — see validationBaseline.ts). A fallback
  // baseline is built from state.workflows at finalize time, which by then
  // already reflects whatever the tester changed. Diffing "what the tester
  // ended up with" against itself always comes out as zero drift and 100%
  // kept — not because our model was perfect, but because there was no
  // untouched snapshot to compare against. Including these would silently
  // and systematically flatter every accuracy number. We exclude them, but
  // report the count so it's visible how much of the historical data this
  // throws away.
  const reportsWithGenerationBaseline = linkedReports.filter(
    (report) => report.validation_data?.baseline?.source === 'generation',
  )
  const excludedReportCount =
    linkedReports.length - reportsWithGenerationBaseline.length

  let totalProposed = 0
  let totalKept = 0
  const volumeDeltas = []
  const durationDeltas = []
  let workflowsAdded = 0
  let workflowsRemoved = 0

  for (const report of reportsWithGenerationBaseline) {
    const baselineWorkflows = report.validation_data?.baseline?.workflows ?? {}
    const decisions = report.validation_data?.workflowDecisions ?? {}
    const changes = report.validation_data?.workflowChanges ?? {}

    const proposedNames = Object.keys(baselineWorkflows)
    totalProposed += proposedNames.length

    for (const name of proposedNames) {
      const decision = decisions[name]
      // volumePct/durationPct are only meaningful for workflows the tester
      // kept — validate-finalize.js never computes a correction for a
      // workflow the tester removed, so a removed workflow's volumePct is
      // not "we were 0% off", it's simply not a corrected value at all.
      if (decision?.kept === true) {
        totalKept += 1
        if (typeof decision.volumePct === 'number') {
          volumeDeltas.push(decision.volumePct)
        }
        if (typeof decision.durationPct === 'number') {
          durationDeltas.push(decision.durationPct)
        }
      }
    }

    if (Array.isArray(changes.added)) workflowsAdded += changes.added.length
    if (Array.isArray(changes.removed)) {
      workflowsRemoved += changes.removed.length
    }
  }

  const accuracyCaveat =
    excludedReportCount > 0
      ? `Excludes ${excludedReportCount} report(s) without a 'generation' baseline (pre-instrumentation reports whose only "baseline" is the tester's own corrected numbers, or reports not yet validated).`
      : null

  const modelAccuracy = {
    reports_excluded: metric({
      value: excludedReportCount,
      unit: 'count',
      label: 'Reports excluded from accuracy stats',
      explains:
        "Reports linked to real testers whose validation_data has no 'generation' baseline, so they cannot tell us anything true about how far off our AI's original guess was. Shown so the accuracy sample size below is legible, not hidden.",
      formula:
        "count of linked reports where baseline.source != 'generation' (including reports never validated)",
      sample: linkedReports.length,
    }),
    workflows_kept_pct: metric({
      value:
        totalProposed > 0 ? round((totalKept / totalProposed) * 100) : null,
      unit: 'percent',
      label: 'Workflows kept',
      explains:
        "Of the workflows our AI proposed, this share survived the tester's validation unchanged in identity (not removed). Low means we are proposing workflows that do not actually exist for that company.",
      formula: 'kept workflows / total workflows proposed',
      sample: totalProposed,
      caveat: accuracyCaveat,
      healthy: "high is good — low means we propose work that doesn't exist",
    }),
    volume_drift: metric({
      value: volumeDeltas.length > 0 ? round(mean(volumeDeltas)) : null,
      unit: 'percent',
      label: 'Volume drift',
      explains:
        'Mean signed correction testers made to our guessed monthly volume, for workflows they kept. Negative means we tend to overestimate how much volume a workflow handles; positive means we underestimate. This is a mean of signed values, so overestimates and underestimates on different workflows can cancel out — it tells you our average bias, not our average error size.',
      formula: 'mean(volumePct) across kept workflows',
      sample: volumeDeltas.length,
      caveat: accuracyCaveat,
      healthy:
        'near 0% is healthy — large positive or negative means our volume estimates are systematically off',
    }),
    duration_drift: metric({
      value: durationDeltas.length > 0 ? round(mean(durationDeltas)) : null,
      unit: 'percent',
      label: 'Duration drift',
      explains:
        'Mean signed correction testers made to our guessed minutes-per-item, for workflows they kept. Same caveat as volume drift: negative means we overestimate time spent, positive means we underestimate, and it can mask cancelling errors on different workflows.',
      formula: 'mean(durationPct) across kept workflows',
      sample: durationDeltas.length,
      caveat: accuracyCaveat,
      healthy:
        'near 0% is healthy — large positive or negative means our time estimates are systematically off',
    }),
    workflows_added: metric({
      value: workflowsAdded,
      unit: 'count',
      label: 'Workflows testers added',
      explains:
        'Unit: workflows, not testers — a single tester can add more than one missed workflow, so this can exceed the tester count. Total individual workflows testers added via chat that our AI missed entirely in its first pass. This is a count of misses, not a percentage — there is no fixed denominator for "workflows we could have proposed but didn\'t". `sample` below counts the reports this was tallied across, not the workflows themselves.',
      formula: 'sum of workflowChanges.added.length across counted reports',
      sample: reportsWithGenerationBaseline.length,
      caveat: accuracyCaveat,
    }),
    workflows_removed: metric({
      value: workflowsRemoved,
      unit: 'count',
      label: 'Workflows testers removed',
      explains:
        'Unit: workflows, not testers — a single tester can remove more than one workflow, so this can exceed the tester count. Total individual workflows testers explicitly rejected as not applicable to their company. Overlaps conceptually with the inverse of workflows_kept_pct, but is reported separately as a plain count since it\'s the more actionable number for "which proposed workflows should we stop proposing". `sample` below counts the reports this was tallied across, not the workflows themselves.',
      formula: 'sum of workflowChanges.removed.length across counted reports',
      sample: reportsWithGenerationBaseline.length,
      caveat: accuracyCaveat,
    }),
  }

  // ── 4. TRUST DELTA ────────────────────────────────────────────────────
  // trust_before is asked at the start of the validation wizard, trust_after
  // at the end (see OverviewStep.jsx / FeedbackStep.jsx). We only average
  // over testers who answered *both* — mixing in someone who answered only
  // one half would let mean(before) and mean(after) drift apart from being
  // computed over different people, and the "delta" would stop meaning
  // "how this group's trust moved" and start meaning "difference between
  // two unrelated groups".
  const pairedTrust = realTesterRows.filter(
    (row) =>
      typeof row.trust_before === 'number' &&
      typeof row.trust_after === 'number',
  )
  const meanTrustBefore = mean(pairedTrust.map((row) => row.trust_before))
  const meanTrustAfter = mean(pairedTrust.map((row) => row.trust_after))

  const trust = {
    trust_before: metric({
      value: round(meanTrustBefore, 2),
      unit: 'scale_1_5',
      label: 'Trust before',
      explains:
        "Mean self-reported trust in the AI's numbers, asked before the tester corrects anything in the validation wizard.",
      formula: 'mean(trust_before) over testers who answered both questions',
      sample: pairedTrust.length,
    }),
    trust_after: metric({
      value: round(meanTrustAfter, 2),
      unit: 'scale_1_5',
      label: 'Trust after',
      explains:
        "Mean self-reported trust after the tester has seen and corrected the AI's numbers.",
      formula: 'mean(trust_after) over testers who answered both questions',
      sample: pairedTrust.length,
    }),
    delta: metric({
      value:
        pairedTrust.length > 0
          ? round(meanTrustAfter - meanTrustBefore, 2)
          : null,
      unit: 'scale_1_5',
      label: 'Trust delta',
      explains:
        "How much correcting the AI's numbers themselves moved trust, on average. Positive means the validation step itself builds trust (seeing and fixing the model increases confidence); negative means it erodes it (the corrections needed were big enough to undermine confidence in the original report).",
      formula: 'mean(trust_after) - mean(trust_before), same paired testers',
      sample: pairedTrust.length,
      healthy:
        'positive is good — validation should build confidence, not erode it',
    }),
  }

  // ── 5. EXPERIENCE ─────────────────────────────────────────────────────
  const intakeEaseValues = realTesterRows
    .map((row) => row.intake_ease)
    .filter((v) => typeof v === 'number')
  const reportClarityValues = realTesterRows
    .map((row) => row.report_clarity)
    .filter((v) => typeof v === 'number')

  const unclearCounts = new Map()
  for (const row of realTesterRows) {
    if (typeof row.unclear_reason === 'string' && row.unclear_reason) {
      unclearCounts.set(
        row.unclear_reason,
        (unclearCounts.get(row.unclear_reason) ?? 0) + 1,
      )
    }
  }
  const unclearTotal = [...unclearCounts.values()].reduce((a, b) => a + b, 0)
  const unclearRanked = [...unclearCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) =>
      metric({
        value: count,
        unit: 'count',
        label: reason,
        explains:
          'How many low-clarity testers (report_clarity <= 3) picked this specific reason for why the report was unclear. Only asked when clarity was rated low, so this is a breakdown of *why* people were confused, not a general-purpose survey question everyone answers.',
        formula: `count of testers picking "${reason}" as unclear_reason`,
        sample: unclearTotal,
      }),
    )

  const experience = {
    intake_ease: metric({
      value:
        intakeEaseValues.length > 0 ? round(mean(intakeEaseValues), 2) : null,
      unit: 'scale_1_5',
      label: 'Intake ease',
      explains: 'Mean self-reported ease of the intake step (1-5 scale).',
      formula: 'mean(intake_ease) over testers who answered it',
      sample: intakeEaseValues.length,
      healthy:
        'high is good — low means the intake step itself is a barrier, independent of the report being accurate',
    }),
    report_clarity: metric({
      value:
        reportClarityValues.length > 0
          ? round(mean(reportClarityValues), 2)
          : null,
      unit: 'scale_1_5',
      label: 'Report clarity',
      explains:
        'Mean self-reported clarity of the finished report (1-5 scale).',
      formula: 'mean(report_clarity) over testers who answered it',
      sample: reportClarityValues.length,
      healthy:
        'high is good — low means the report is hard to understand even when the numbers are right',
    }),
    unclear_reason: unclearRanked,
  }

  // ── 6. PMF (Sean Ellis / Vohra test) ──────────────────────────────────
  // "Completed survey" here means the tester answered the core PMF
  // question (pmf_disappointed) — that's the question the score is built
  // from, so it's the right denominator, independent of whether they also
  // answered the optional free-text follow-ups.
  //
  // raw_pmf and segmented_pmf always compute and ship a value once the
  // denominator is nonzero — pmfReady no longer decides whether the number
  // is *shown*, only what caveat (if any) rides along with it. Confidence
  // (derived from `sample` in metric()) already tells the reader how much
  // to trust it; hiding the number on top of that would just be redundant
  // and would invite people to reconstruct it themselves from the raw
  // counts anyway.
  const pmfCounts = { very: 0, somewhat: 0, not: 0 }
  for (const row of realTesterRows) {
    if (row.pmf_disappointed === 'Very disappointed') pmfCounts.very += 1
    else if (row.pmf_disappointed === 'Somewhat disappointed') {
      pmfCounts.somewhat += 1
    } else if (row.pmf_disappointed === 'Not disappointed') pmfCounts.not += 1
  }
  const completedSurveys = pmfCounts.very + pmfCounts.somewhat + pmfCounts.not
  const pmfReady = completedSurveys >= PMF_MIN_SAMPLE
  const segmentedDenominator = pmfCounts.very + pmfCounts.somewhat
  const pmfCaveat = pmfReady
    ? null
    : `Needs ${PMF_MIN_SAMPLE - completedSurveys} more completed survey(s) before this is trustworthy.`

  const pmf = {
    very_disappointed: metric({
      value: pmfCounts.very,
      unit: 'count',
      label: 'Very disappointed',
      explains:
        'Testers who said they would be very disappointed to lose this.',
      formula: "count of pmf_disappointed = 'Very disappointed'",
      sample: completedSurveys,
    }),
    somewhat_disappointed: metric({
      value: pmfCounts.somewhat,
      unit: 'count',
      label: 'Somewhat disappointed',
      explains:
        'Testers who said they would be somewhat disappointed to lose this.',
      formula: "count of pmf_disappointed = 'Somewhat disappointed'",
      sample: completedSurveys,
    }),
    not_disappointed: metric({
      value: pmfCounts.not,
      unit: 'count',
      label: 'Not disappointed',
      explains: 'Testers who said they would not be disappointed to lose this.',
      formula: "count of pmf_disappointed = 'Not disappointed'",
      sample: completedSurveys,
    }),
    raw_pmf: metric({
      value:
        completedSurveys > 0
          ? round((pmfCounts.very / completedSurveys) * 100)
          : null,
      unit: 'percent',
      label: 'Raw PMF score',
      explains:
        'The classic Sean Ellis "40% rule" score: share of all respondents who would be very disappointed. Below the sample floor this still computes and ships — hiding it just pushes people to do the division themselves from the raw counts, with none of the caveats attached. Instead it carries confidence: \'low\' and a caveat spelling out exactly how many more responses would make it trustworthy; treat it as a rough read until then, not a number to act on.',
      formula: 'very / (very + somewhat + not disappointed)',
      sample: completedSurveys,
      caveat: pmfCaveat,
      healthy:
        '40%+ is the traditional bar for product-market fit — higher is better',
    }),
    segmented_pmf: metric({
      value:
        segmentedDenominator > 0
          ? round((pmfCounts.very / segmentedDenominator) * 100)
          : null,
      unit: 'percent',
      label: 'Segmented PMF score (Vohra)',
      explains:
        'Rahul Vohra\'s variant: share of engaged respondents (very + somewhat disappointed) who said very. Excludes "not disappointed" respondents from the denominator on the theory that they may not be the target user at all. Same sample floor and same reasoning as the raw score above — always shown, confidence and caveat carry the "how much to trust this" signal instead of hiding the number.',
      formula: 'very / (very + somewhat disappointed)',
      sample: completedSurveys,
      caveat: pmfCaveat,
      healthy:
        '40%+ among engaged users signals product-market fit — higher is better',
    }),
  }

  // ── 7. INTENT (for the CEO) ───────────────────────────────────────────
  // How soon a tester says they'd actually move on this, in their own
  // words at the end of the validation wizard — a leading indicator of
  // real budget intent, as distinct from the PMF survey's retrospective
  // "would you miss it" framing.
  const intentCounts = { this_quarter: 0, next_quarter: 0, exploring: 0 }
  let intentAnswered = 0
  for (const row of realTesterRows) {
    if (
      row.intent_timeline === 'this_quarter' ||
      row.intent_timeline === 'next_quarter' ||
      row.intent_timeline === 'exploring'
    ) {
      intentCounts[row.intent_timeline] += 1
      intentAnswered += 1
    }
  }

  const intent = {
    this_quarter: metric({
      value: intentCounts.this_quarter,
      unit: 'count',
      label: 'Intent: this quarter',
      explains:
        "Testers who said they'd want to move on this in the current quarter.",
      formula: "count of intent_timeline = 'this_quarter'",
      sample: intentAnswered,
    }),
    next_quarter: metric({
      value: intentCounts.next_quarter,
      unit: 'count',
      label: 'Intent: next quarter',
      explains: 'Testers who said next quarter, not this one.',
      formula: "count of intent_timeline = 'next_quarter'",
      sample: intentAnswered,
    }),
    exploring: metric({
      value: intentCounts.exploring,
      unit: 'count',
      label: 'Intent: exploring',
      explains:
        "Testers who said they're just exploring, no concrete timeline yet.",
      formula: "count of intent_timeline = 'exploring'",
      sample: intentAnswered,
    }),
  }

  // ── 8. RECRUITING TARGET ──────────────────────────────────────────────
  // gap_a: the plain arithmetic gap to a PMF-worthy sample.
  //
  // gap_b: a cheap, honest proxy for "are we still learning new things from
  // new testers, or have we saturated". We are not clustering open-text
  // themes yet (see OPEN TEXT below) so this cannot detect a genuinely new
  // *theme* in the NLP sense — it checks whether the last 3 testers said
  // something (a categorical unclear_reason, or any open-text answer) that
  // no earlier tester said verbatim. That will trigger often while the
  // sample is small (everything looks "new" when there's little history to
  // compare against), which is the correct behavior: it's exactly the
  // testers we have the least signal on where recruiting more matters most.
  const sortedByCreatedAt = [...realTesterRows].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at),
  )
  const lastThree = sortedByCreatedAt.slice(-3)

  function hasSignalNotSeenBefore(row) {
    const earlierRows = sortedByCreatedAt.filter(
      (other) => new Date(other.created_at) < new Date(row.created_at),
    )
    if (typeof row.unclear_reason === 'string' && row.unclear_reason) {
      const seenBefore = earlierRows.some(
        (other) => other.unclear_reason === row.unclear_reason,
      )
      if (!seenBefore) return true
    }
    for (const field of OPEN_TEXT_FIELDS) {
      const value = row[field]
      if (typeof value === 'string' && value.trim()) {
        const seenBefore = earlierRows.some(
          (other) =>
            typeof other[field] === 'string' &&
            other[field].trim() === value.trim(),
        )
        if (!seenBefore) return true
      }
    }
    return false
  }

  const gapA = Math.max(0, PMF_MIN_SAMPLE - completedSurveys)
  const gapB = lastThree.some(hasSignalNotSeenBefore) ? 3 : 0
  const recruitingTargetValue = Math.max(gapA, gapB)

  const recruitingTarget = {
    target: metric({
      value: recruitingTargetValue,
      unit: 'count',
      label: 'Recruiting target',
      explains:
        'How many more testers to go recruit right now. Whichever pressure is currently binding: needing a large enough sample for a trustworthy PMF score, or still seeing fresh, unrepeated feedback from the most recent testers (meaning we have not yet heard everything this round of testing has to teach us).',
      formula: 'max(gap_a, gap_b)',
      sample: totalTesters,
    }),
    gap_a: metric({
      value: gapA,
      unit: 'count',
      label: 'Sample-size gap',
      explains:
        'How many more completed PMF surveys are needed to reach the trustworthy-sample floor.',
      formula: `max(0, ${PMF_MIN_SAMPLE} - completed surveys)`,
      sample: completedSurveys,
    }),
    gap_b: metric({
      value: gapB,
      unit: 'count',
      label: 'Fresh-signal gap',
      explains:
        'Fixed bump of 3 if any of the last 3 testers said something (an unclear_reason option, or any open-text answer) that no earlier tester said verbatim — a proxy for "we might still be learning new things", not true theme detection (see OPEN TEXT).',
      formula:
        '3 if any of the last 3 testers has an unseen-before answer, else 0',
      sample: lastThree.length,
    }),
  }

  // ── 9. OPEN TEXT ───────────────────────────────────────────────────────
  // Raw, unclustered free-text answers, grouped only by which question they
  // came from. Deliberately not summarized or theme-tagged here — that's
  // real analysis work a human (or a separate pass) should do by reading
  // them, not a number this route should quietly decide for you.
  function openTextEntries(field) {
    return realTesterRows
      .filter((row) => typeof row[field] === 'string' && row[field].trim())
      .map((row) => ({
        email: one(row.invite)?.email ?? null,
        value: row[field],
      }))
  }

  const openText = Object.fromEntries(
    OPEN_TEXT_FIELDS.map((field) => [field, openTextEntries(field)]),
  )

  // ── 10. WHAT TO FIX ───────────────────────────────────────────────────
  // A ranked list of concrete problems, built only from things we can
  // already count — not from clustering open-text themes (we don't do that
  // yet, same reasoning as OPEN TEXT above). Three kinds of evidence feed
  // this:
  //   1. Each unclear_reason option is its own candidate problem — we
  //      already know how many testers picked it, and unclear_note answers
  //      from those same testers attach as supporting quotes, because
  //      unclear_reason and unclear_note are collected together in the same
  //      moment (see report/[id].jsx's tour-exit handler).
  //   2. The single biggest raw drop between two consecutive funnel steps —
  //      the step where testers most concretely stopped continuing.
  //   3. A funnel integrity_warning, if present, becomes its own problem: it
  //      isn't a UX issue to fix, it's a reason not to trust the funnel
  //      numbers at all until it's fixed — so its tester_count is set to
  //      every real tester, which naturally ranks it at or near the top.
  // Every other open-text answer (validation_note, pmf_main_benefit,
  // pmf_improvement, not_disappointed_reason, and any unclear_note that
  // didn't attach to an unclear_reason problem above) lands in one
  // ungrouped bucket rather than being force-fit into a category we didn't
  // actually detect. Ranked by tester_count, descending — the problem
  // touching the most people sorts first.
  const whatToFix = []

  for (const [reason, count] of unclearCounts.entries()) {
    const quotes = realTesterRows
      .filter(
        (row) =>
          row.unclear_reason === reason &&
          typeof row.unclear_note === 'string' &&
          row.unclear_note.trim(),
      )
      .map((row) => ({
        email: one(row.invite)?.email ?? null,
        text: row.unclear_note,
      }))
    whatToFix.push({
      id: `unclear-reason-${slugify(reason)}`,
      title: `Testers found "${reason}" unclear`,
      evidence: `${count} of ${unclearTotal} low-clarity testers (report_clarity <= 3) named "${reason}" as the specific thing that was unclear.`,
      tester_count: count,
      share_pct: unclearTotal > 0 ? round((count / unclearTotal) * 100) : null,
      quotes,
      source: 'unclear_reason',
      confidence: confidenceFromSample(unclearTotal),
    })
  }

  // Only a real, positive drop counts as a "problem" here — if the funnel
  // isn't monotonic (funnelIntegrityWarning is set), a negative "drop" is a
  // data bug, not a UX finding, and is surfaced separately below instead of
  // being reported as attrition that didn't actually happen.
  let biggestDrop = null
  for (let i = 1; i < FUNNEL_STEPS.length; i++) {
    const fromStep = FUNNEL_STEPS[i - 1]
    const toStep = FUNNEL_STEPS[i]
    const drop = funnelCounts[fromStep] - funnelCounts[toStep]
    if (drop > 0 && (biggestDrop == null || drop > biggestDrop.drop)) {
      biggestDrop = { fromStep, toStep, drop }
    }
  }
  if (biggestDrop) {
    const fromCount = funnelCounts[biggestDrop.fromStep]
    const fromLabel = biggestDrop.fromStep.replace('reached_', '')
    const toLabel = biggestDrop.toStep.replace('reached_', '')
    const dropPct =
      fromCount > 0 ? round((biggestDrop.drop / fromCount) * 100) : null
    whatToFix.push({
      id: `funnel-dropoff-${fromLabel}-${toLabel}`,
      title: `Biggest drop-off: ${fromLabel} → ${toLabel}`,
      evidence: `${biggestDrop.drop} of ${fromCount} testers who reached ${fromLabel} never reached ${toLabel}${dropPct != null ? ` (${dropPct}% attrition at this step)` : ''}.`,
      tester_count: biggestDrop.drop,
      share_pct: dropPct,
      quotes: [],
      source: 'funnel',
      confidence: confidenceFromSample(totalTesters),
    })
  }

  if (funnelIntegrityWarning) {
    whatToFix.push({
      id: 'funnel-integrity',
      title: 'Funnel counts are internally inconsistent',
      evidence: funnelIntegrityWarning,
      tester_count: totalTesters,
      share_pct: null,
      quotes: [],
      source: 'integrity',
      confidence: confidenceFromSample(totalTesters),
    })
  }

  const OTHER_OPEN_TEXT_FIELDS = OPEN_TEXT_FIELDS.filter(
    (field) => field !== 'unclear_note',
  )
  const ungroupedQuotes = []
  for (const row of realTesterRows) {
    const email = one(row.invite)?.email ?? null
    for (const field of OTHER_OPEN_TEXT_FIELDS) {
      const value = row[field]
      if (typeof value === 'string' && value.trim()) {
        ungroupedQuotes.push({ email, text: value })
      }
    }
    // unclear_note only lands here if it didn't already attach to an
    // unclear_reason problem above (i.e. this tester had no unclear_reason).
    if (
      row.unclear_reason == null &&
      typeof row.unclear_note === 'string' &&
      row.unclear_note.trim()
    ) {
      ungroupedQuotes.push({ email, text: row.unclear_note })
    }
  }
  if (ungroupedQuotes.length > 0) {
    const contributingTesters = new Set(
      ungroupedQuotes.map((q) => q.email).filter(Boolean),
    )
    whatToFix.push({
      id: 'open-text-ungrouped',
      title: 'Other open-text feedback (not yet clustered)',
      evidence: `${ungroupedQuotes.length} free-text answer(s) across intake, validation, and PMF questions that don't map to a specific counted problem above — read these directly, they are not auto-clustered into themes yet.`,
      tester_count: contributingTesters.size,
      share_pct: null,
      quotes: ungroupedQuotes,
      source: 'open_text',
      confidence: confidenceFromSample(contributingTesters.size),
    })
  }

  // ── Model accuracy failure candidates ───────────────────────────────────
  // Same population and per-metric sample sizes as modelAccuracy above.
  // Thresholds are deliberately more permissive than "any drift at all" —
  // some correction is expected and healthy; these fire only once the model
  // is systematically wrong, not merely imperfect.
  if (
    modelAccuracy.workflows_kept_pct.value != null &&
    modelAccuracy.workflows_kept_pct.value < 80
  ) {
    whatToFix.push({
      id: 'model-accuracy-workflows-kept',
      title: "We propose workflows that don't exist",
      evidence: `Only ${modelAccuracy.workflows_kept_pct.value}% of proposed workflows survived tester validation unchanged (threshold: 80%), across ${reportsWithGenerationBaseline.length} report(s).`,
      tester_count: reportsWithGenerationBaseline.length,
      share_pct: null,
      quotes: [],
      source: 'model_accuracy',
      confidence: modelAccuracy.workflows_kept_pct.confidence,
    })
  }

  if (
    modelAccuracy.volume_drift.value != null &&
    Math.abs(modelAccuracy.volume_drift.value) > 25
  ) {
    whatToFix.push({
      id: 'model-accuracy-volume-drift',
      title: 'Our volume estimates are systematically off',
      evidence: `Mean volume correction was ${modelAccuracy.volume_drift.value > 0 ? '+' : ''}${modelAccuracy.volume_drift.value}% across kept workflows (threshold: ±25%).`,
      tester_count: reportsWithGenerationBaseline.length,
      share_pct: null,
      quotes: [],
      source: 'model_accuracy',
      confidence: modelAccuracy.volume_drift.confidence,
    })
  }

  if (
    modelAccuracy.duration_drift.value != null &&
    Math.abs(modelAccuracy.duration_drift.value) > 25
  ) {
    whatToFix.push({
      id: 'model-accuracy-duration-drift',
      title: 'Our duration estimates are systematically off',
      evidence: `Mean duration correction was ${modelAccuracy.duration_drift.value > 0 ? '+' : ''}${modelAccuracy.duration_drift.value}% across kept workflows (threshold: ±25%).`,
      tester_count: reportsWithGenerationBaseline.length,
      share_pct: null,
      quotes: [],
      source: 'model_accuracy',
      confidence: modelAccuracy.duration_drift.confidence,
    })
  }

  if (modelAccuracy.workflows_added.value > 0) {
    whatToFix.push({
      id: 'model-accuracy-workflows-added',
      title: 'Our research misses workflows entirely',
      evidence: `Testers manually added ${modelAccuracy.workflows_added.value} workflow(s) our AI missed entirely, across ${reportsWithGenerationBaseline.length} report(s).`,
      tester_count: reportsWithGenerationBaseline.length,
      share_pct: null,
      quotes: [],
      source: 'model_accuracy',
      confidence: modelAccuracy.workflows_added.confidence,
    })
  }

  // ── Trust delta failure candidate ───────────────────────────────────────
  if (trust.delta.value != null && trust.delta.value < 0) {
    whatToFix.push({
      id: 'trust-delta-negative',
      title: 'Validation destroys confidence instead of building it',
      evidence: `Trust moved ${trust.delta.value} (before ${trust.trust_before.value} → after ${trust.trust_after.value}) across ${pairedTrust.length} tester(s) who answered both questions.`,
      tester_count: pairedTrust.length,
      share_pct: null,
      quotes: [],
      source: 'trust_delta',
      confidence: trust.delta.confidence,
    })
  }

  // ── Tester experience failure candidates ────────────────────────────────
  if (
    experience.intake_ease.value != null &&
    experience.intake_ease.value < 3
  ) {
    whatToFix.push({
      id: 'experience-intake-ease',
      title: 'The intake form is a barrier',
      evidence: `Mean intake ease was ${experience.intake_ease.value} / 5 (threshold: 3), across ${intakeEaseValues.length} tester(s).`,
      tester_count: intakeEaseValues.length,
      share_pct: null,
      quotes: [],
      source: 'experience',
      confidence: experience.intake_ease.confidence,
    })
  }

  if (
    experience.report_clarity.value != null &&
    experience.report_clarity.value < 3
  ) {
    whatToFix.push({
      id: 'experience-report-clarity',
      title: "People don't understand the report",
      evidence: `Mean report clarity was ${experience.report_clarity.value} / 5 (threshold: 3), across ${reportClarityValues.length} tester(s).`,
      tester_count: reportClarityValues.length,
      share_pct: null,
      quotes: [],
      source: 'experience',
      confidence: experience.report_clarity.confidence,
    })
  }

  // ── PMF failure candidate ────────────────────────────────────────────────
  // Gated on the trustworthy-sample floor so this doesn't duplicate the
  // "need more surveys" signal already carried by gap_a — it only fires once
  // the score itself is reliable enough to act on.
  if (
    completedSurveys >= PMF_MIN_SAMPLE &&
    pmf.segmented_pmf.value != null &&
    pmf.segmented_pmf.value < 40
  ) {
    whatToFix.push({
      id: 'pmf-below-bar',
      title: "People don't need this enough",
      evidence: `${pmf.segmented_pmf.value}% of engaged testers said "very disappointed" without LyRise (bar: 40%), across ${completedSurveys} completed survey(s).`,
      tester_count: completedSurveys,
      share_pct: null,
      quotes: [],
      source: 'pmf',
      confidence: pmf.segmented_pmf.confidence,
    })
  }

  // ── Rank by severity, not just reach ────────────────────────────────────
  // Tester count only breaks ties *within* a severity tier. If the data
  // itself is lying (integrity), nothing else on this page can be trusted;
  // if the model is wrong (model_accuracy), no UI polish saves the product;
  // a trust delta that goes negative means the one moment we ask testers to
  // trust us is actively working against us. Everything below that is
  // progressively closer to polish than substance. `open_text` sits last
  // because it is explicitly ungrouped, uncounted feedback (see its push()
  // above) rather than a specific, measured problem.
  const SEVERITY_ORDER = [
    'integrity',
    'model_accuracy',
    'trust_delta',
    'funnel',
    'unclear_reason',
    'experience',
    'pmf',
    'open_text',
  ]
  whatToFix.sort((a, b) => {
    const tierDiff =
      SEVERITY_ORDER.indexOf(a.source) - SEVERITY_ORDER.indexOf(b.source)
    return tierDiff !== 0 ? tierDiff : b.tester_count - a.tester_count
  })

  // A low-confidence candidate (sample < 5) can still appear in the ranked
  // list — it just cannot be the single headline item a reader sees first.
  // Promote the first reliable-enough candidate to the top instead; if every
  // candidate is low-confidence, there is nothing safer to promote to, so
  // the severity ordering above stands as-is.
  if (whatToFix.length > 0 && whatToFix[0].confidence === 'low') {
    const promoteIndex = whatToFix.findIndex(
      (item) => item.confidence !== 'low',
    )
    if (promoteIndex > 0) {
      const [promoted] = whatToFix.splice(promoteIndex, 1)
      whatToFix.unshift(promoted)
    }
  }

  function buildLinearUrl(item) {
    if (!LINEAR_NEW_ISSUE_URL) return null
    const descriptionParts = [item.evidence]
    if (item.quotes.length > 0) {
      descriptionParts.push(
        '',
        'Quotes:',
        ...item.quotes.map((q) => `- "${q.text}" — ${q.email ?? 'unknown'}`),
      )
    }
    const params = new URLSearchParams({
      title: item.title,
      description: descriptionParts.join('\n'),
    })
    return `${LINEAR_NEW_ISSUE_URL}?${params.toString()}`
  }

  for (const item of whatToFix) {
    item.linear_url = buildLinearUrl(item)
  }

  res.status(200).json({
    testers: {
      total: metric({
        value: totalTesters,
        unit: 'count',
        label: 'Real testers',
        explains:
          'Everyone who counts as a genuine alpha tester: has a live (non-revoked) invite, an external (non-@lyrise.ai) email, and got at least as far as the intake step.',
        formula:
          'count of alpha_feedback rows with a live, external invite and reached_intake = true',
        sample: totalTesters,
      }),
      rows: testerRows,
    },
    funnel,
    model_accuracy: modelAccuracy,
    trust,
    experience,
    pmf,
    intent,
    recruiting_target: recruitingTarget,
    open_text: openText,
    what_to_fix: whatToFix,
  })
}
