begin;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'starter',
  status text not null default 'active' check (status in ('active', 'trial', 'suspended', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('usuario', 'admin', 'master', 'system_admin'));

alter table public.companies
  add column if not exists tenant_id uuid references public.tenants(id);

alter table public.profiles
  add column if not exists tenant_id uuid references public.tenants(id);

insert into public.tenants (name, slug, status)
select
  c.name,
  regexp_replace(lower(coalesce(nullif(c.document, ''), c.id::text)), '[^a-z0-9]+', '-', 'g'),
  case when c.active then 'active' else 'suspended' end
from public.companies c
where c.tenant_id is null
on conflict (slug) do nothing;

update public.companies c
set tenant_id = t.id
from public.tenants t
where c.tenant_id is null
  and t.slug = regexp_replace(lower(coalesce(nullif(c.document, ''), c.id::text)), '[^a-z0-9]+', '-', 'g');

update public.profiles p
set tenant_id = c.tenant_id
from public.companies c
where p.company_id = c.id
  and p.tenant_id is null;

create table if not exists public.tenant_members (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin', 'owner', 'system_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table if not exists public.company_members (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin', 'owner')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

insert into public.tenant_members (tenant_id, user_id, role, active)
select
  p.tenant_id,
  p.id,
  case
    when p.role = 'system_admin' then 'system_admin'
    when p.role = 'master' then 'owner'
    when p.role = 'admin' then 'admin'
    else 'member'
  end,
  p.active
from public.profiles p
where p.tenant_id is not null
on conflict (tenant_id, user_id) do update
set role = excluded.role,
    active = excluded.active,
    updated_at = now();

insert into public.company_members (company_id, user_id, role, active)
select
  p.company_id,
  p.id,
  case
    when p.role in ('master', 'system_admin') then 'owner'
    when p.role = 'admin' then 'admin'
    else 'member'
  end,
  p.active
from public.profiles p
where p.company_id is not null
on conflict (company_id, user_id) do update
set role = excluded.role,
    active = excluded.active,
    updated_at = now();

create index if not exists companies_tenant_idx on public.companies(tenant_id, active);
create index if not exists profiles_tenant_idx on public.profiles(tenant_id, active);
create index if not exists tenant_members_user_idx on public.tenant_members(user_id, active);
create index if not exists company_members_user_idx on public.company_members(user_id, active);

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.company_members enable row level security;

create or replace function public.app_current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from public.profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.app_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.app_is_system_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'system_admin'
      and active = true
  )
$$;

create or replace function public.app_is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('master', 'system_admin')
      and active = true
  )
$$;

create or replace function public.tenant_match(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_tenant_id = public.app_current_tenant_id()
$$;

create or replace function public.company_match(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = target_company_id
      and (
        c.id = public.app_current_company_id()
        or c.tenant_id = public.app_current_tenant_id()
      )
  )
$$;

create or replace function public.app_can_admin_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_is_system_admin()
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.active = true
        and p.tenant_id = target_tenant_id
        and p.role = 'master'
    )
    or exists (
      select 1
      from public.tenant_members tm
      where tm.user_id = auth.uid()
        and tm.tenant_id = target_tenant_id
        and tm.active = true
        and tm.role in ('owner', 'system_admin')
    )
$$;

create or replace function public.app_can_admin_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_is_system_admin()
    or exists (
      select 1
      from public.companies c
      where c.id = target_company_id
        and public.app_can_admin_tenant(c.tenant_id)
    )
    or exists (
      select 1
      from public.company_members cm
      where cm.user_id = auth.uid()
        and cm.company_id = target_company_id
        and cm.active = true
        and cm.role = 'owner'
    )
$$;

create or replace function public.client_company_match(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = target_client_id
      and public.company_match(c.company_id)
  )
$$;

create or replace function public.contract_company_match(target_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contracts c
    where c.id = target_contract_id
      and public.company_match(c.company_id)
  )
$$;

create or replace function public.nfse_company_match(target_nfse_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nfse_documents n
    where n.id = target_nfse_document_id
      and public.company_match(n.company_id)
  )
$$;

create or replace function public.app_has_permission(permission_module text, permission_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_is_master()
    or exists (
      select 1
      from public.user_groups ug
      join public.profiles target_profile on target_profile.id = ug.user_id
      join public.group_permissions gp on gp.group_id = ug.group_id
      join public.permissions p on p.id = gp.permission_id
      where ug.user_id = auth.uid()
        and target_profile.tenant_id = public.app_current_tenant_id()
        and p.module = permission_module
        and p.action = permission_action
    )
$$;

drop policy if exists tenants_visible on public.tenants;
create policy tenants_visible
on public.tenants
for select to authenticated
using (public.app_is_system_admin() or public.tenant_match(id));

drop policy if exists tenants_system_admin_write on public.tenants;
create policy tenants_system_admin_write
on public.tenants
for all to authenticated
using (public.app_is_system_admin())
with check (public.app_is_system_admin());

drop policy if exists tenant_members_visible on public.tenant_members;
create policy tenant_members_visible
on public.tenant_members
for select to authenticated
using (public.app_is_system_admin() or public.tenant_match(tenant_id));

drop policy if exists tenant_members_admin_write on public.tenant_members;
create policy tenant_members_admin_write
on public.tenant_members
for all to authenticated
using (public.app_can_admin_tenant(tenant_id))
with check (public.app_can_admin_tenant(tenant_id));

drop policy if exists company_members_visible on public.company_members;
create policy company_members_visible
on public.company_members
for select to authenticated
using (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists company_members_admin_write on public.company_members;
create policy company_members_admin_write
on public.company_members
for all to authenticated
using (public.app_can_admin_company(company_id))
with check (public.app_can_admin_company(company_id));

drop policy if exists companies_same_company_select on public.companies;
create policy companies_same_tenant_select
on public.companies
for select to authenticated
using (public.app_is_system_admin() or public.tenant_match(tenant_id));

drop policy if exists profiles_same_company_select on public.profiles;
create policy profiles_same_tenant_select
on public.profiles
for select to authenticated
using (id = auth.uid() or public.app_is_system_admin() or public.tenant_match(tenant_id));

drop policy if exists profiles_master_write on public.profiles;
create policy profiles_tenant_admin_write
on public.profiles
for all to authenticated
using (public.app_is_system_admin() or public.app_can_admin_tenant(tenant_id))
with check (public.app_is_system_admin() or public.app_can_admin_tenant(tenant_id));

drop policy if exists permissions_master_write on public.permissions;
create policy permissions_system_admin_write
on public.permissions
for all to authenticated
using (public.app_is_system_admin())
with check (public.app_is_system_admin());

drop policy if exists groups_same_company_select on public.groups;
create policy groups_same_tenant_select
on public.groups
for select to authenticated
using (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists groups_master_write on public.groups;
create policy groups_company_admin_write
on public.groups
for all to authenticated
using (public.app_can_admin_company(company_id))
with check (public.app_can_admin_company(company_id));

drop policy if exists group_permissions_same_company_select on public.group_permissions;
create policy group_permissions_same_tenant_select
on public.group_permissions
for select to authenticated
using (
  public.app_is_system_admin()
  or exists (
    select 1 from public.groups g
    where g.id = group_permissions.group_id
      and public.company_match(g.company_id)
  )
);

drop policy if exists group_permissions_master_write on public.group_permissions;
create policy group_permissions_company_admin_write
on public.group_permissions
for all to authenticated
using (
  public.app_is_system_admin()
  or exists (
    select 1 from public.groups g
    where g.id = group_permissions.group_id
      and public.app_can_admin_company(g.company_id)
  )
)
with check (
  public.app_is_system_admin()
  or exists (
    select 1 from public.groups g
    where g.id = group_permissions.group_id
      and public.app_can_admin_company(g.company_id)
  )
);

drop policy if exists user_groups_same_company_select on public.user_groups;
create policy user_groups_same_tenant_select
on public.user_groups
for select to authenticated
using (
  user_id = auth.uid()
  or public.app_is_system_admin()
  or exists (
    select 1
    from public.profiles p
    where p.id = user_groups.user_id
      and public.tenant_match(p.tenant_id)
  )
);

drop policy if exists user_groups_master_write on public.user_groups;
create policy user_groups_tenant_admin_write
on public.user_groups
for all to authenticated
using (
  public.app_is_system_admin()
  or exists (
    select 1
    from public.profiles p
    where p.id = user_groups.user_id
      and public.app_can_admin_tenant(p.tenant_id)
  )
)
with check (
  public.app_is_system_admin()
  or exists (
    select 1
    from public.profiles p
    where p.id = user_groups.user_id
      and public.app_can_admin_tenant(p.tenant_id)
  )
);

drop policy if exists clients_same_company_all on public.clients;
create policy clients_same_company_all
on public.clients
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists client_contacts_same_company_all on public.client_contacts;
create policy client_contacts_same_company_all
on public.client_contacts
for all to authenticated
using (public.app_is_system_admin() or public.client_company_match(client_id))
with check (public.app_is_system_admin() or public.client_company_match(client_id));

drop policy if exists contracts_same_company_all on public.contracts;
create policy contracts_same_company_all
on public.contracts
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists contract_adjustments_same_company_all on public.contract_adjustments;
create policy contract_adjustments_same_company_all
on public.contract_adjustments
for all to authenticated
using (public.app_is_system_admin() or public.contract_company_match(contract_id))
with check (public.app_is_system_admin() or public.contract_company_match(contract_id));

drop policy if exists financial_entries_same_company_all on public.financial_entries;
create policy financial_entries_same_company_all
on public.financial_entries
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists payables_same_company_all on public.payables;
create policy payables_same_company_all
on public.payables
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists bank_accounts_same_company_all on public.bank_accounts;
create policy bank_accounts_same_company_all
on public.bank_accounts
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists bank_transactions_same_company_all on public.bank_transactions;
create policy bank_transactions_same_company_all
on public.bank_transactions
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists bank_reconciliations_same_company_all on public.bank_reconciliations;
create policy bank_reconciliations_same_company_all
on public.bank_reconciliations
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists nfse_documents_same_company_all on public.nfse_documents;
create policy nfse_documents_same_company_all
on public.nfse_documents
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists nfse_events_same_company_all on public.nfse_events;
create policy nfse_events_same_company_all
on public.nfse_events
for all to authenticated
using (public.app_is_system_admin() or public.nfse_company_match(nfse_document_id))
with check (public.app_is_system_admin() or public.nfse_company_match(nfse_document_id));

drop policy if exists boleto_charges_same_company_all on public.boleto_charges;
create policy boleto_charges_same_company_all
on public.boleto_charges
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists api_credentials_master_all on public.api_credentials;
create policy api_credentials_company_admin_all
on public.api_credentials
for all to authenticated
using (public.app_can_admin_company(company_id))
with check (public.app_can_admin_company(company_id));

drop policy if exists digital_certificates_master_all on public.digital_certificates;
create policy digital_certificates_company_admin_all
on public.digital_certificates
for all to authenticated
using (public.app_can_admin_company(company_id))
with check (public.app_can_admin_company(company_id));

drop policy if exists email_settings_master_all on public.email_settings;
create policy email_settings_company_admin_all
on public.email_settings
for all to authenticated
using (public.app_can_admin_company(company_id))
with check (public.app_can_admin_company(company_id));

drop policy if exists email_logs_same_company_select on public.email_logs;
create policy email_logs_same_company_select
on public.email_logs
for select to authenticated
using (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists files_same_company_all on public.files;
create policy files_same_company_all
on public.files
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists audit_logs_same_company_select on public.audit_logs;
create policy audit_logs_same_company_select
on public.audit_logs
for select to authenticated
using (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists service_records_same_company_all on public.service_records;
create policy service_records_same_company_all
on public.service_records
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

grant execute on function public.app_current_tenant_id() to authenticated;
grant execute on function public.app_current_company_id() to authenticated;
grant execute on function public.app_is_system_admin() to authenticated;
grant execute on function public.app_is_master() to authenticated;
grant execute on function public.tenant_match(uuid) to authenticated;
grant execute on function public.company_match(uuid) to authenticated;
grant execute on function public.app_can_admin_tenant(uuid) to authenticated;
grant execute on function public.app_can_admin_company(uuid) to authenticated;
grant execute on function public.app_has_permission(text, text) to authenticated;

commit;
