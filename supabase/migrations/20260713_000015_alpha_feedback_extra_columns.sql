-- Two columns alpha_feedback was missing for answers that were already being
-- collected in the UI but had nowhere to land:
--
--   not_disappointed_reason: the PMF survey's alternate question, shown only
--   when a tester answers "Not disappointed" to pmf_disappointed
--   (pages/alpha-survey.jsx) — collected into local component state but the
--   payload sent to /api/alpha/progress never included it. No column meant
--   no way to persist it even if the payload had.
--
--   intent_timeline: the validation wizard's budget-timing question ("When
--   would you want to move on process mapping for these workflows?",
--   src/components/ROIGenerator/Validation/steps/CompleteStep.jsx). Already
--   persisted in reports.validation_data.budgetTiming, but that lives on a
--   per-report row with no easy join back to the rest of a tester's
--   alpha_feedback answers — this makes it queryable alongside everything
--   else on the same row.
--
-- Additive only. The base table (20260713_000014_alpha_feedback_rebuild.sql)
-- is already applied — this migration only adds columns to it, nothing is
-- renamed, dropped, or altered on existing columns.

alter table public.alpha_feedback
  add column if not exists not_disappointed_reason text,
  add column if not exists intent_timeline text;

-- Mirrors CompleteStep.jsx's BUDGET_OPTIONS values exactly.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'alpha_feedback_intent_timeline_values'
      and conrelid = 'public.alpha_feedback'::regclass
  ) then
    alter table public.alpha_feedback
      add constraint alpha_feedback_intent_timeline_values
        check (
          intent_timeline is null
          or intent_timeline in ('this_quarter', 'next_quarter', 'exploring')
        );
  end if;
end $$;
