-- ─────────────────────────────────────────────────────────────────────────────
-- v2_reports — Durable storage for completed V2 Profit Map journeys (LYR-203 / LYR-234).
--
-- V2 runs alongside V1 and never touches V1 tables (public.reports, etc.).
-- All reads/writes happen server-side via SUPABASE_SERVICE_ROLE_KEY.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.v2_reports (
  id uuid primary key,
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

-- RLS enabled with NO policies:
-- Anon and authenticated clients get 0 rows; access is gated via service-role API routes.
alter table public.v2_reports enable row level security;

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

