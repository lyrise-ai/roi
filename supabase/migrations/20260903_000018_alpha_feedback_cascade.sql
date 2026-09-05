-- Fix alpha_feedback FK constraints to CASCADE on report deletion (LYR-176).
--
-- Background:
-- In migration 20260713_000014_alpha_feedback_rebuild.sql, foreign keys for
-- alpha_feedback were defined without explicit 'ON DELETE' clauses:
--   invite_id uuid references public.alpha_invites (id)
--   report_id uuid references public.reports (id)
--
-- Postgres defaults omitted ON DELETE clauses to 'NO ACTION' (RESTRICT).
-- As a result, attempting to delete any report that has attached alpha_feedback
-- rows fails with a foreign key constraint violation (500 error in API route
-- /api/reports/[id].js).
--
-- Decision: CASCADE vs SET NULL for report_id:
-- We choose 'ON DELETE CASCADE' for report_id:
-- 1. Identity data (company_name, email) is not duplicated on alpha_feedback;
--    it is joined from public.reports. Nullifying report_id leaves orphaned
--    feedback rows with no company context or report association.
-- 2. Sister tables referencing public.reports (chat_messages, chat_usage,
--    report_evidence, roi_usage) all use 'ON DELETE CASCADE'.
-- 3. When an employee deletes a report, deleting associated alpha feedback
--    preserves referential integrity and cleans up report sub-resources.
--
-- For invite_id, we use 'ON DELETE SET NULL' so that deleting an invite
-- (if ever performed) does not delete historical feedback or block invite cleanup.

do $$
begin
  -- Drop existing report_id foreign key constraint if it exists
  if exists (
    select 1 from pg_constraint
    where conname = 'alpha_feedback_report_id_fkey'
      and conrelid = 'public.alpha_feedback'::regclass
  ) then
    alter table public.alpha_feedback
      drop constraint alpha_feedback_report_id_fkey;
  end if;

  -- Add updated constraint with ON DELETE CASCADE
  alter table public.alpha_feedback
    add constraint alpha_feedback_report_id_fkey
      foreign key (report_id)
      references public.reports (id)
      on delete cascade;

  -- Drop existing invite_id foreign key constraint if it exists
  if exists (
    select 1 from pg_constraint
    where conname = 'alpha_feedback_invite_id_fkey'
      and conrelid = 'public.alpha_feedback'::regclass
  ) then
    alter table public.alpha_feedback
      drop constraint alpha_feedback_invite_id_fkey;
  end if;

  -- Add updated constraint with ON DELETE SET NULL
  alter table public.alpha_feedback
    add constraint alpha_feedback_invite_id_fkey
      foreign key (invite_id)
      references public.alpha_invites (id)
      on delete set null;
end $$;
