-- Colleague invites for report sharing ("Loop in a colleague").
-- Reuses chat_usage as both the access grant AND the per-user chat quota for
-- invited colleagues, rather than adding a dedicated table: a colleague
-- invite is just a chat_usage row created ahead of time (user_id null until
-- the invite is first claimed), keyed by a durable, revocable token embedded
-- in the invite email. Mirrors the existing alpha_invites durable-token
-- pattern (see 20260705_000012_alpha_invites.sql) rather than emailing a
-- raw, single-use Supabase magic link.

alter table public.chat_usage
  add column if not exists invited_email text,
  add column if not exists invite_token text;

create unique index if not exists chat_usage_invite_token_key
  on public.chat_usage (invite_token)
  where invite_token is not null;
