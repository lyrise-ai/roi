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

-- The live database names the report link alpha_feedback_report_id_fkey1,
-- not ..._fkey. When migration 000014 renamed the old table to
-- alpha_feedback_archive, that table kept the plain name, so Postgres added
-- the 1. Dropping only ..._fkey would leave the old link in place, and it
-- would keep blocking deletes. So we drop both names.

alter table public.alpha_feedback
  drop constraint if exists alpha_feedback_report_id_fkey,
  drop constraint if exists alpha_feedback_report_id_fkey1,
  drop constraint if exists alpha_feedback_invite_id_fkey,
  add constraint alpha_feedback_report_id_fkey
    foreign key (report_id) references public.reports (id) on delete cascade,
  add constraint alpha_feedback_invite_id_fkey
    foreign key (invite_id) references public.alpha_invites (id) on delete set null;
