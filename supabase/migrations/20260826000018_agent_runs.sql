-- Where a V2 agent keeps its memory between wakes (LYR-226).
--
-- Both V2 agents work while the user answers the interview, and most of that
-- time is spent waiting for a person to type. So neither one runs continuously.
-- Each wakes on something happening — an answer submitted, a finding landing,
-- the interview ending — takes a short turn, saves, and sleeps.
--
-- That only works if its memory outlives the request that woke it. Vercel throws
-- the server away between requests, and a request may not run longer than 300
-- seconds anyway, so a loop that waits for a human cannot sit inside one. This
-- row is what it wakes up into.
--
-- It is the same idea as `reports.state_data`, which has carried V1 report state
-- for months. Separate table on purpose: V1 is frozen and nothing here may read
-- or write anything it owns.
--
-- `state` holds the agent's messages and whatever its owner keeps beside them.
-- It must stay SMALL — page text belongs in `research_artifacts`, and the
-- messages carry only the URL. See the note in src/lib/roi/v2/runs.ts.

create table if not exists public.agent_runs (
  id text primary key,
  -- 'research' or 'report'. Two agents, two rows, one report; this is also how
  -- we tell their costs apart.
  kind text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists agent_runs_expires_idx
  on public.agent_runs (expires_at);

-- Mirrors research_artifacts: no client reads this directly, it goes through the
-- service role, which bypasses RLS. Enabled with no policy so an anon or
-- authenticated key gets nothing.
alter table public.agent_runs enable row level security;
