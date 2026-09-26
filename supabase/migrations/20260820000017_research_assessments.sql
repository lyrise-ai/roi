-- Cached research assessments for the Profit Map research analyst (LYR-216).
--
-- The analyst reasons once over everything the scouts found. That reasoning is
-- a model call, so two things matter: a refresh inside the TTL must not re-bill,
-- and a result must stay stable for a short window rather than changing under a
-- prospect who reloads the page mid-interview.
--
-- Keyed on a hash of the rendered research, NOT on the domain. Keying on domain
-- alone would serve a stale assessment after the research itself changed, and
-- would also collapse the partial assessment made when only S1 has landed with
-- the full one made after S2 — which is precisely the distinction the
-- incremental path depends on. Same research in, same assessment out; different
-- research, different key, and it re-runs on its own.
--
-- Contains model output about public companies, nothing prospect-specific, and
-- is written only by the service role.

create table if not exists public.research_assessments (
  cache_key text primary key,
  domain text not null,
  assessment jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists research_assessments_expires_idx
  on public.research_assessments (expires_at);

-- Mirrors research_artifacts: no client reads this directly, the cache goes
-- through the service role, which bypasses RLS. Enabled with no policy so an
-- anon or authenticated key gets nothing.
alter table public.research_assessments enable row level security;
