-- ─────────────────────────────────────────────────────────────────────────────
-- v2_reports — Durable storage for completed V2 Profit Map journeys (LYR-203 / LYR-234 / LYR-236).
--
-- V2 runs alongside V1 and never touches V1 tables (public.reports, etc.).
-- A report starts with no owner: owner_id stays empty until sign-in, and the link
-- still works (the unguessable UUID link is the key).
--
-- Signing in on /v2 fills owner_id without changing id or the link.
-- One RLS policy: a signed-in user reads rows where owner_id is theirs.
-- Reading by link uses the admin key on the server by exact id, bypassing RLS.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.v2_reports (
  id uuid primary key,
  owner_id uuid references auth.users (id) on delete set null,
  -- Handed only to the browser that saved the report. Claiming needs it, so a
  -- forwarded link can't take ownership.
  claim_token uuid not null default gen_random_uuid(),
  company jsonb not null,
  pains jsonb not null,
  research jsonb not null,
  words jsonb not null,
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for chronological queries
create index if not exists v2_reports_created_at_idx
  on public.v2_reports (created_at desc);

-- Index for owner lookups and listing
create index if not exists v2_reports_owner_id_idx
  on public.v2_reports (owner_id);

-- Enable RLS
alter table public.v2_reports enable row level security;

-- Only the server writes, with the admin key.
revoke insert, update, delete on public.v2_reports from anon, authenticated;

-- One RLS policy: a signed-in user reads rows where owner_id is theirs
drop policy if exists "Users can read own v2 reports" on public.v2_reports;
create policy "Users can read own v2 reports"
  on public.v2_reports
  for select
  to authenticated
  using (auth.uid() = owner_id);

-- ── updated_at trigger ───────────────────────────────────────────────────────
create or replace function public.set_v2_reports_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists v2_reports_set_updated_at on public.v2_reports;
create trigger v2_reports_set_updated_at
  before update on public.v2_reports
  for each row
  execute function public.set_v2_reports_updated_at();
