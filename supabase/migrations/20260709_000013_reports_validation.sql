-- Backs the ROI Validation Flow: a short wizard between report generation and
-- the polished report where the user confirms/adjusts the AI's first-pass
-- workflow assumptions. validated_at gates access (see pages/report/[id].jsx);
-- validation_data is the wizard's own decision log (kept/removed workflows,
-- volume/duration adjustment deltas, feedback, budget timing) — the
-- authoritative workflow model itself stays in reports.state_data.

alter table public.reports
  add column if not exists validated_at timestamptz,
  add column if not exists validation_data jsonb;
