-- Change ROI usage alerts from a fixed 30-day cooldown to threshold steps
-- within the same rolling window. Example with threshold=10:
--   10-19.99 USD => step 1 alert
--   20-29.99 USD => step 2 alert
--   30-39.99 USD => step 3 alert
-- If the rolling-window total later drops to a lower step, the baseline is
-- lowered too, so future re-crossings can alert again.

alter table public.roi_usage_alert_state
  add column if not exists last_sent_step int4 not null default 0;

create or replace function public.claim_roi_usage_cost_alert(
  p_alert_type text,
  p_baseline_step int,
  p_target_step int,
  p_lease_seconds int default 300
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_baseline_step int := greatest(coalesce(p_baseline_step, 0), 0);
  v_target_step int := greatest(coalesce(p_target_step, 0), 0);
  v_lease interval :=
    make_interval(secs => greatest(coalesce(p_lease_seconds, 300), 60));
  v_rows int := 0;
begin
  insert into public.roi_usage_alert_state (
    alert_type,
    in_flight_until,
    last_sent_step,
    updated_at
  ) values (
    p_alert_type,
    null,
    0,
    v_now
  )
  on conflict (alert_type) do nothing;

  if v_target_step <= 0 then
    update public.roi_usage_alert_state
    set in_flight_until = null,
      last_sent_step = 0,
        updated_at = v_now
    where alert_type = p_alert_type
      and (in_flight_until is null or in_flight_until < v_now);

    return false;
  end if;

  update public.roi_usage_alert_state
  set last_sent_step = v_baseline_step,
      in_flight_until = null,
      updated_at = v_now
  where alert_type = p_alert_type
    and (in_flight_until is null or in_flight_until < v_now)
    and coalesce(last_sent_step, 0) > v_baseline_step;

  update public.roi_usage_alert_state
  set in_flight_until = v_now + v_lease,
      updated_at = v_now
  where alert_type = p_alert_type
    and (in_flight_until is null or in_flight_until < v_now)
    and coalesce(last_sent_step, 0) < v_target_step;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.mark_roi_usage_cost_alert_sent(
  p_alert_type text,
  p_total_cost_usd numeric,
  p_sent_step int
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.roi_usage_alert_state
  set in_flight_until = null,
      last_sent_at = now(),
      last_sent_cost_usd = coalesce(p_total_cost_usd, last_sent_cost_usd),
      last_sent_step = greatest(coalesce(p_sent_step, 0), 0),
      updated_at = now()
  where alert_type = p_alert_type;
end;
$$;

drop function if exists public.claim_roi_usage_cost_alert(text, int, int);
drop function if exists public.mark_roi_usage_cost_alert_sent(text, numeric);

revoke all on function public.claim_roi_usage_cost_alert(text, int, int, int)
  from public;
grant execute on function public.claim_roi_usage_cost_alert(text, int, int, int)
  to service_role;

revoke all on function public.mark_roi_usage_cost_alert_sent(text, numeric, int)
  from public;
grant execute on function public.mark_roi_usage_cost_alert_sent(text, numeric, int)
  to service_role;
