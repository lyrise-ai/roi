-- Index to support efficient querying of demo tour events by type and time.
-- Used for lead follow-up queries:
--   select meta->>'email', meta->>'company_name', meta->>'step_index'
--   from events where type like 'demo_tour_%' order by created_at desc

create index if not exists events_type_created_idx
  on public.events (type, created_at desc);
