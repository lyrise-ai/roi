-- Reusable, revocable alpha invite links (LYR-66).
-- Each row is a stable token an employee can hand to one alpha tester and
-- reuse indefinitely: visiting /auth/alpha?token=<token> mints and verifies
-- a fresh one-time Supabase magic link server-side on every visit, so the
-- link itself never expires or gets "used up". Setting revoked_at disables
-- it immediately without needing to delete history.

create table if not exists public.alpha_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text,
  token text not null,
  user_id uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists alpha_invites_token_key
  on public.alpha_invites (token);

create index if not exists alpha_invites_email_idx
  on public.alpha_invites (email);

-- At most one active (non-revoked) invite per email. The API also checks
-- this before inserting, but the partial unique index is what actually
-- closes the race between two concurrent "generate" clicks for the same
-- email.
create unique index if not exists alpha_invites_active_email_key
  on public.alpha_invites (email)
  where revoked_at is null;

-- Service-role only (admin API routes) — no client-facing policies.
alter table public.alpha_invites enable row level security;
