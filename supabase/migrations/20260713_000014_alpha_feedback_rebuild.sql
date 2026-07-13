-- Rebuild alpha_feedback as a proper, migration-controlled table.
--
-- The previous alpha_feedback was created by hand in the Supabase UI — no
-- migration in this repo ever defined it. Application code drifted from the
-- live schema (writing company_name / user_email columns that don't exist),
-- and Postgres silently rejected every row that included them, breaking
-- intake tracking and the entire PMF survey. See the alpha data-flow audit
-- for the full trace.
--
-- This migration archives the old table (renamed, not dropped — its rows
-- stay readable at alpha_feedback_archive) and creates a fresh alpha_feedback
-- with an explicit column list. company_name/user_email are deliberately
-- absent: identity is joined from reports (company_name, email) and
-- alpha_invites (email, full_name) via report_id/invite_id instead of being
-- duplicated onto every row. Validation deltas are deliberately absent too —
-- those already live in reports.validation_data (see
-- 20260709_000013_reports_validation.sql) and have no reason to be
-- duplicated here.

-- ── Step 1: archive the old, hand-created table ─────────────────────────────
-- Guarded on the archive's absence (not the source table's presence) so this
-- block runs exactly once: after the first run, "alpha_feedback" refers to
-- the fresh table created below, and to_regclass('alpha_feedback') would
-- otherwise still be non-null on a re-run and re-archive the wrong table.
do $$
declare
  r record;
begin
  if to_regclass('public.alpha_feedback_archive') is null
     and to_regclass('public.alpha_feedback') is not null then

    -- Drop any client-facing policies the hand-created table may carry —
    -- the archive is inert history from here on, service-role only.
    for r in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = 'alpha_feedback'
    loop
      execute format(
        'drop policy if exists %I on public.alpha_feedback',
        r.policyname
      );
    end loop;

    alter table public.alpha_feedback rename to alpha_feedback_archive;

    -- Table rename does not rename the indexes it owns, and index names are
    -- unique per-schema (not per-table) in Postgres — so without this, the
    -- fresh table's auto-named indexes below (e.g. "alpha_feedback_pkey")
    -- would collide with the archive's old ones. Suffix unconditionally
    -- rather than assuming the hand-created table's indexes were ever named
    -- with an "alpha_feedback" prefix to begin with.
    for r in
      select indexname from pg_indexes
      where schemaname = 'public' and tablename = 'alpha_feedback_archive'
    loop
      execute format(
        'alter index public.%I rename to %I',
        r.indexname,
        r.indexname || '_archived'
      );
    end loop;

    alter table public.alpha_feedback_archive enable row level security;
  end if;
end $$;

-- ── Step 2: fresh, migration-controlled alpha_feedback ──────────────────────
create table if not exists public.alpha_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- identity — joined, never duplicated
  session_token text not null unique,
  invite_id uuid references public.alpha_invites (id),
  report_id uuid references public.reports (id),
  user_id uuid,

  -- inline questions asked at each step of the tour
  intake_ease smallint,
  intake_ease_note text,
  trust_before smallint,
  trust_after smallint,
  validation_note text,
  report_clarity smallint,
  unclear_reason text,
  unclear_note text,

  -- PMF survey (unchanged questions)
  pmf_disappointed text,
  pmf_who_benefits text,
  pmf_main_benefit text,
  pmf_improvement text,
  pmf_virality smallint,

  -- funnel progress — each step written independently, by whichever page the
  -- tester actually reaches, so one broken write can't mask another's flag
  reached_intake boolean not null default false,
  reached_generation boolean not null default false,
  reached_validation boolean not null default false,
  reached_report boolean not null default false,
  reached_survey boolean not null default false,

  -- passive
  chat_keywords jsonb,

  -- 1..5 star/scale ratings only — NULL is "not answered yet", not zero.
  constraint alpha_feedback_intake_ease_range
    check (intake_ease is null or intake_ease between 1 and 5),
  constraint alpha_feedback_trust_before_range
    check (trust_before is null or trust_before between 1 and 5),
  constraint alpha_feedback_trust_after_range
    check (trust_after is null or trust_after between 1 and 5),
  constraint alpha_feedback_report_clarity_range
    check (report_clarity is null or report_clarity between 1 and 5),
  constraint alpha_feedback_pmf_virality_range
    check (pmf_virality is null or pmf_virality between 1 and 5)
);

create index if not exists alpha_feedback_invite_id_idx
  on public.alpha_feedback (invite_id);

create index if not exists alpha_feedback_report_id_idx
  on public.alpha_feedback (report_id);

-- Service-role only (admin API routes) — no client-facing policies, same
-- pattern as alpha_invites. All reads/writes go through server routes.
alter table public.alpha_feedback enable row level security;

-- ── updated_at trigger ───────────────────────────────────────────────────────
-- No existing repo-wide convention for this (roi_usage_alert_state sets
-- updated_at manually inside its own RPC functions) — but alpha_feedback will
-- be written from several independent server routes rather than one RPC, so a
-- trigger is the only way to guarantee it's never missed.
create or replace function public.set_alpha_feedback_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists alpha_feedback_set_updated_at on public.alpha_feedback;
create trigger alpha_feedback_set_updated_at
  before update on public.alpha_feedback
  for each row
  execute function public.set_alpha_feedback_updated_at();
