-- Atomic slot claim for share-link chat cap.
-- Increments share_message_count by 1 only if it is below p_max, and
-- returns the new count. Returns NULL when the cap is reached or the
-- report does not exist. Callers must treat a NULL result as "denied"
-- and avoid running the LLM, so two concurrent submits cannot both
-- pass the in-memory gate and over-spend the cap.

create or replace function public.claim_share_chat_slot(
  p_report_id uuid,
  p_max int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_count int;
begin
  update public.reports
     set share_message_count = share_message_count + 1
   where id = p_report_id
     and share_message_count < p_max
   returning share_message_count into v_new_count;
  return v_new_count;
end;
$$;

revoke all on function public.claim_share_chat_slot(uuid, int) from public;
grant execute on function public.claim_share_chat_slot(uuid, int) to service_role;
