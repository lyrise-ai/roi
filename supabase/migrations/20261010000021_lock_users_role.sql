-- Signed-in users could write their own row in `users`, including `role`.
-- So anyone could set role = 'EMPLOYEE' from the browser and read every report.
--
-- Only the server writes this table (src/lib/authHelpers.ts, admin key), so the
-- browser keys lose write access altogether. Reading their own row still works.

revoke insert, update, delete on public.users from anon, authenticated;

drop policy if exists "users_insert_self" on public.users;
drop policy if exists "users_update_self" on public.users;
drop policy if exists "users_can_insert_own_row" on public.users;
