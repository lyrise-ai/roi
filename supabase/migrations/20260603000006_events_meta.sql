-- Add a nullable JSONB `meta` column to events for ad-hoc event metadata
-- (first use: chat session durationMs for share-link recipients). Additive and
-- safe: existing rows get NULL, existing inserts are unaffected.

alter table public.events
  add column if not exists meta jsonb;
