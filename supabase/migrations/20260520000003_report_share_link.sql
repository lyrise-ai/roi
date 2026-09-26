-- Share-link access for ROI reports.
-- Adds an unguessable per-report token so email recipients can open the
-- live chat panel without a Supabase login. `share_revoked_at` lets an
-- employee kill a leaked link without deleting the report.
-- `share_message_count` tracks the 5-message cap independently from the
-- report owner's own chat_usage row.

alter table public.reports
  add column if not exists share_token text,
  add column if not exists share_revoked_at timestamptz,
  add column if not exists share_message_count int4 not null default 0;

update public.reports
   set share_token = encode(gen_random_bytes(24), 'base64')
 where share_token is null;

create unique index if not exists reports_share_token_key
  on public.reports (share_token);
