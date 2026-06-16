-- Per-report LLM cost / time / token monitoring for the internal dashboard.
-- One row per report (upserted on report_id). Written via the service-role key
-- (supabaseAdmin, bypasses RLS); read only by employees.
--
-- NOTE: this mirrors the schema actually applied in Supabase (canonical). Time
-- column is created_at (not ts); report_id is required and unique.

create table if not exists public.roi_usage (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  company text,
  mode text not null default 'generate'
    check (mode = any (array['generate'::text, 'chat'::text])),
  duration_ms integer not null default 0,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  calls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- One usage row per report (chat turns upsert onto the same row).
create unique index if not exists roi_usage_report_key
  on public.roi_usage (report_id);

create index if not exists roi_usage_user_created_idx
  on public.roi_usage (user_id, created_at desc);

create index if not exists roi_usage_created_idx
  on public.roi_usage (created_at desc);

alter table public.roi_usage enable row level security;

drop policy if exists "roi_usage_select_employee" on public.roi_usage;
create policy "roi_usage_select_employee"
  on public.roi_usage
  for select
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid() and u.role = 'EMPLOYEE'
    )
  );
