-- Shared artifact cache for the Profit Map research system (LYR-187 R1).
--
-- Raw fetched page content keyed by normalized URL, so the careers page is
-- fetched once however many scouts want it, and a second Profit Map for the
-- same company is nearly free. Content is public web pages, nothing
-- prospect-specific, and is written only by the service role.

create table if not exists public.research_artifacts (
  url_key text primary key,
  content text not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists research_artifacts_expires_idx
  on public.research_artifacts (expires_at);

-- No client ever reads this directly: the cache goes through the service role,
-- which bypasses RLS. Enabled with no policy so an anon or authenticated key
-- gets nothing.
alter table public.research_artifacts enable row level security;
