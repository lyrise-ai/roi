-- Signed-in users could write their own row in `users`, including `role`.
-- So anyone could set role = 'EMPLOYEE' from the browser and read every report.
--
-- Only the server writes this table (src/lib/authHelpers.ts, admin key), so the
-- browser keys lose write access altogether. Reading their own row still works.

revoke insert, update, delete on public.users from anon, authenticated;

drop policy if exists "users_insert_self" on public.users;
drop policy if exists "users_update_self" on public.users;
drop policy if exists "users_can_insert_own_row" on public.users;

-- Same reason: these functions run with full rights and only the server calls
-- them (admin key). `revoke ... from public` in their migrations did not remove
-- Supabase's own grants to anon and authenticated, so remove those here.
revoke execute on function public.upsert_roi_usage(uuid, uuid, text, text, integer, integer, integer, integer, numeric, jsonb) from anon, authenticated;
revoke execute on function public.claim_roi_usage_cost_alert(text, integer, integer, integer) from anon, authenticated;
revoke execute on function public.mark_roi_usage_cost_alert_sent(text, numeric, integer) from anon, authenticated;
revoke execute on function public.release_roi_usage_cost_alert_claim(text) from anon, authenticated;
revoke execute on function public.claim_share_chat_slot(uuid, integer) from anon, authenticated;
