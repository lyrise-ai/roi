-- Additive upsert for roi_usage. The table keeps ONE row per report
-- (unique on report_id), but a report's cost accrues across the initial
-- generation AND every subsequent chat turn. A plain upsert would REPLACE
-- the row, so the expensive generation cost would be overwritten by a cheap
-- chat turn and the dashboard would undercount real spend.
--
-- This function merges instead: on conflict it sums cost/tokens/duration and
-- concatenates the per-call breakdown. `company` is kept from the first write
-- (generation), and `mode` reflects the latest activity. user_id is filled in
-- if it was previously null.

create or replace function public.upsert_roi_usage(
  p_report_id uuid,
  p_user_id uuid,
  p_company text,
  p_mode text,
  p_duration_ms int,
  p_input_tokens int,
  p_output_tokens int,
  p_total_tokens int,
  p_cost_usd numeric,
  p_calls jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roi_usage (
    report_id, user_id, company, mode,
    duration_ms, input_tokens, output_tokens, total_tokens, cost_usd, calls
  ) values (
    p_report_id, p_user_id, p_company, p_mode,
    coalesce(p_duration_ms, 0),
    coalesce(p_input_tokens, 0),
    coalesce(p_output_tokens, 0),
    coalesce(p_total_tokens, 0),
    coalesce(p_cost_usd, 0),
    coalesce(p_calls, '[]'::jsonb)
  )
  on conflict (report_id) do update set
    duration_ms   = roi_usage.duration_ms   + coalesce(excluded.duration_ms, 0),
    input_tokens  = roi_usage.input_tokens  + coalesce(excluded.input_tokens, 0),
    output_tokens = roi_usage.output_tokens + coalesce(excluded.output_tokens, 0),
    total_tokens  = roi_usage.total_tokens  + coalesce(excluded.total_tokens, 0),
    cost_usd      = roi_usage.cost_usd      + coalesce(excluded.cost_usd, 0),
    calls         = roi_usage.calls || coalesce(excluded.calls, '[]'::jsonb),
    -- keep the original company; surface the most recent mode/user.
    mode          = excluded.mode,
    user_id       = coalesce(roi_usage.user_id, excluded.user_id);
end;
$$;

revoke all on function public.upsert_roi_usage(
  uuid, uuid, text, text, int, int, int, int, numeric, jsonb
) from public;
grant execute on function public.upsert_roi_usage(
  uuid, uuid, text, text, int, int, int, int, numeric, jsonb
) to service_role;
