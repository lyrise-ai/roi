-- Flags reports generated through the alpha tour (?alpha=<token> on /roi-report).
-- Alpha runs share the normal generation pipeline, so without this column they
-- are indistinguishable from real client/employee reports in the dashboards.
-- The internal Reports + Usage dashboards use it to badge alpha runs separately
-- instead of surfacing them as normal reports.

alter table public.reports
  add column if not exists is_alpha boolean not null default false;
