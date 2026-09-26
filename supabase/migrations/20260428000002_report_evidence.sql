create table if not exists public.report_evidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  url text,
  title text,
  source_type text,
  snippet text,
  facts_json jsonb,
  confidence text,
  used_in_sections jsonb,
  created_at timestamptz not null default now()
);

create index if not exists report_evidence_report_created_idx
  on public.report_evidence (report_id, created_at desc);

create index if not exists report_evidence_source_type_idx
  on public.report_evidence (source_type);

alter table public.report_evidence enable row level security;

drop policy if exists "report_evidence_select_owner_or_employee" on public.report_evidence;
create policy "report_evidence_select_owner_or_employee"
  on public.report_evidence
  for select
  using (
    exists (
      select 1
      from public.reports r
      where r.id = report_evidence.report_id
        and (
          r.user_id = auth.uid()
          or exists (
            select 1
            from public.users u
            where u.id = auth.uid() and u.role = 'EMPLOYEE'
          )
        )
    )
  );
