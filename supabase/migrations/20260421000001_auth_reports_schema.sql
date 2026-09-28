create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  role text,
  prompt_count int4 not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  company_name text,
  email text,
  input_data jsonb,
  status text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  rendered_html text,
  rendered_full_html text,
  state_data jsonb
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid references public.reports (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  role text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  report_id uuid references public.reports (id) on delete cascade,
  message_count int4 not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  report_id uuid references public.reports (id) on delete set null,
  type text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists chat_usage_user_report_key
  on public.chat_usage (user_id, report_id);

create index if not exists reports_user_created_idx
  on public.reports (user_id, created_at desc);

create index if not exists reports_status_idx
  on public.reports (status);

create index if not exists chat_messages_report_user_created_idx
  on public.chat_messages (report_id, user_id, created_at desc);

create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

create index if not exists events_user_report_created_idx
  on public.events (user_id, report_id, created_at desc);

alter table public.users enable row level security;
alter table public.reports enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_usage enable row level security;
alter table public.events enable row level security;

drop policy if exists "users_select_self" on public.users;
create policy "users_select_self"
  on public.users
  for select
  using (auth.uid() = id);

drop policy if exists "users_insert_self" on public.users;
create policy "users_insert_self"
  on public.users
  for insert
  with check (auth.uid() = id);

drop policy if exists "users_update_self" on public.users;
create policy "users_update_self"
  on public.users
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "reports_select_owner_or_employee" on public.reports;
create policy "reports_select_owner_or_employee"
  on public.reports
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid() and u.role = 'EMPLOYEE'
    )
  );

drop policy if exists "reports_insert_owner_or_employee" on public.reports;
create policy "reports_insert_owner_or_employee"
  on public.reports
  for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid() and u.role = 'EMPLOYEE'
    )
  );

drop policy if exists "reports_update_owner_or_employee" on public.reports;
create policy "reports_update_owner_or_employee"
  on public.reports
  for update
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid() and u.role = 'EMPLOYEE'
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.users u
      where u.id = auth.uid() and u.role = 'EMPLOYEE'
    )
  );

drop policy if exists "chat_messages_select_own" on public.chat_messages;
create policy "chat_messages_select_own"
  on public.chat_messages
  for select
  using (user_id = auth.uid());

drop policy if exists "chat_messages_insert_own" on public.chat_messages;
create policy "chat_messages_insert_own"
  on public.chat_messages
  for insert
  with check (user_id = auth.uid());

drop policy if exists "chat_usage_select_own" on public.chat_usage;
create policy "chat_usage_select_own"
  on public.chat_usage
  for select
  using (user_id = auth.uid());

drop policy if exists "chat_usage_insert_own" on public.chat_usage;
create policy "chat_usage_insert_own"
  on public.chat_usage
  for insert
  with check (user_id = auth.uid());

drop policy if exists "chat_usage_update_own" on public.chat_usage;
create policy "chat_usage_update_own"
  on public.chat_usage
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own"
  on public.events
  for insert
  with check (user_id = auth.uid());
