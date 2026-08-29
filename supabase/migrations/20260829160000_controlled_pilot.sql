begin;

create table if not exists public.tenant_pilots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  status text not null default 'planned' check (status in ('planned', 'running', 'blocked', 'approved', 'cancelled')),
  started_at timestamptz,
  target_end_at date,
  approved_at timestamptz,
  coordinator_id uuid references public.profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_pilot_checks (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.tenant_pilots(id) on delete cascade,
  check_key text not null,
  category text not null,
  title text not null,
  description text not null,
  required boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'passed', 'failed', 'not_applicable')),
  evidence text,
  notes text,
  checked_by uuid references public.profiles(id),
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pilot_id, check_key)
);

create index if not exists tenant_pilots_status_idx on public.tenant_pilots(status, updated_at desc);
create index if not exists tenant_pilot_checks_pilot_status_idx on public.tenant_pilot_checks(pilot_id, required, status);

alter table public.tenant_pilots enable row level security;
alter table public.tenant_pilot_checks enable row level security;

drop policy if exists tenant_pilots_system_admin_all on public.tenant_pilots;
create policy tenant_pilots_system_admin_all on public.tenant_pilots
for all to authenticated
using (public.app_is_system_admin())
with check (public.app_is_system_admin());

drop policy if exists tenant_pilot_checks_system_admin_all on public.tenant_pilot_checks;
create policy tenant_pilot_checks_system_admin_all on public.tenant_pilot_checks
for all to authenticated
using (public.app_is_system_admin())
with check (public.app_is_system_admin());

grant select, insert, update, delete on public.tenant_pilots to authenticated;
grant select, insert, update, delete on public.tenant_pilot_checks to authenticated;

commit;
