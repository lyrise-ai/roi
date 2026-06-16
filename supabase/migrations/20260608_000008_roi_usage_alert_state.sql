-- Concurrency-safe state for ROI usage threshold alerts.
-- We alert the team once when 30-day ROI usage crosses the configured spend
-- threshold, then suppress duplicates for the cooldown window.

create table if not exists public.roi_usage_alert_state (
  alert_type text primary key,
  in_flight_until timestamptz,
  last_sent_at timestamptz,
  last_sent_cost_usd numeric(12, 6),
  updated_at timestamptz not null default now()
);

alter table public.roi_usage_alert_state enable row level security;

create or replace function public.claim_roi_usage_cost_alert(
  p_alert_type text,
  p_cooldown_seconds int,
  p_lease_seconds int default 300
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_cooldown interval :=
    make_interval(secs => greatest(coalesce(p_cooldown_seconds, 0), 0));
  v_lease interval :=
    make_interval(secs => greatest(coalesce(p_lease_seconds, 300), 60));
  v_rows int := 0;
begin
  insert into public.roi_usage_alert_state (
    alert_type,
    in_flight_until,
    updated_at
  ) values (
    p_alert_type,
    v_now + v_lease,
    v_now
  )
  on conflict (alert_type) do update
    set in_flight_until = v_now + v_lease,
        updated_at = v_now
  where
    (public.roi_usage_alert_state.last_sent_at is null
      or public.roi_usage_alert_state.last_sent_at <= v_now - v_cooldown)
    and (public.roi_usage_alert_state.in_flight_until is null
      or public.roi_usage_alert_state.in_flight_until < v_now);

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.mark_roi_usage_cost_alert_sent(
  p_alert_type text,
  p_total_cost_usd numeric
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
      updated_at = now()
  where alert_type = p_alert_type;
end;
$$;

create or replace function public.release_roi_usage_cost_alert_claim(
  p_alert_type text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.roi_usage_alert_state
  set in_flight_until = null,
      updated_at = now()
  where alert_type = p_alert_type;
end;
$$;

revoke all on function public.claim_roi_usage_cost_alert(text, int, int)
  from public;
grant execute on function public.claim_roi_usage_cost_alert(text, int, int)
  to service_role;

revoke all on function public.mark_roi_usage_cost_alert_sent(text, numeric)
  from public;
grant execute on function public.mark_roi_usage_cost_alert_sent(text, numeric)
  to service_role;

revoke all on function public.release_roi_usage_cost_alert_claim(text)
  from public;
grant execute on function public.release_roi_usage_cost_alert_claim(text)
  to service_role;
