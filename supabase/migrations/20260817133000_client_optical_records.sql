create table if not exists public.client_optical_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  exam_date date not null default current_date,
  professional_name text,
  right_eye jsonb not null default '{}'::jsonb,
  left_eye jsonb not null default '{}'::jsonb,
  clinical_data jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists client_optical_records_company_client_idx
  on public.client_optical_records(company_id, client_id, exam_date desc, created_at desc);

alter table public.client_optical_records enable row level security;

drop policy if exists client_optical_records_same_company_select on public.client_optical_records;
create policy client_optical_records_same_company_select
on public.client_optical_records
for select to authenticated
using (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists client_optical_records_same_company_insert on public.client_optical_records;
create policy client_optical_records_same_company_insert
on public.client_optical_records
for insert to authenticated
with check (
  (public.app_is_system_admin() or public.company_match(company_id))
  and public.client_company_match(client_id)
);
