begin;

create table if not exists public.saas_plans (
  code text primary key,
  name text not null,
  description text not null,
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.saas_plans (code, name, description, limits, features, display_order)
values
  (
    'starter',
    'Starter',
    'Operacao essencial para uma pequena empresa.',
    '{"companies":1,"users":5,"clients":1000,"catalog_items":500,"recurrences":100}'::jsonb,
    '{"nfse":true,"reports":true,"imports":true,"recurring_automation":false,"api_integrations":false,"multi_company":false}'::jsonb,
    10
  ),
  (
    'pro',
    'Pro',
    'Mais capacidade, automacoes e integracoes para empresas em crescimento.',
    '{"companies":3,"users":20,"clients":20000,"catalog_items":5000,"recurrences":2000}'::jsonb,
    '{"nfse":true,"reports":true,"imports":true,"recurring_automation":true,"api_integrations":true,"multi_company":true}'::jsonb,
    20
  ),
  (
    'enterprise',
    'Enterprise',
    'Capacidade personalizada e todos os recursos da plataforma.',
    '{"companies":null,"users":null,"clients":null,"catalog_items":null,"recurrences":null}'::jsonb,
    '{"nfse":true,"reports":true,"imports":true,"recurring_automation":true,"api_integrations":true,"multi_company":true}'::jsonb,
    30
  )
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    limits = excluded.limits,
    features = excluded.features,
    active = true,
    display_order = excluded.display_order,
    updated_at = now();

alter table public.tenants drop constraint if exists tenants_plan_check;
alter table public.tenants
  add constraint tenants_plan_check check (plan in ('starter', 'pro', 'enterprise'));

create table if not exists public.tenant_subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan_code text not null references public.saas_plans(code),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'suspended', 'cancelled')),
  billing_cycle text not null default 'monthly' check (billing_cycle in ('monthly', 'annual', 'manual')),
  amount numeric(14,2) check (amount is null or amount >= 0),
  currency text not null default 'BRL',
  trial_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  external_customer_id text,
  external_subscription_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saas_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reference text not null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'BRL',
  due_date date not null,
  paid_at timestamptz,
  status text not null default 'pending' check (status in ('draft', 'pending', 'paid', 'overdue', 'cancelled')),
  external_id text,
  external_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, reference)
);

create index if not exists tenant_subscriptions_plan_status_idx
  on public.tenant_subscriptions(plan_code, status);
create index if not exists saas_invoices_tenant_due_idx
  on public.saas_invoices(tenant_id, due_date desc, status);

create or replace function public.sync_tenant_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tenant_subscriptions (tenant_id, plan_code, status, updated_at)
  values (
    new.id,
    new.plan,
    case new.status
      when 'trial' then 'trialing'
      when 'suspended' then 'suspended'
      when 'cancelled' then 'cancelled'
      else 'active'
    end,
    now()
  )
  on conflict (tenant_id) do update
  set plan_code = excluded.plan_code,
      status = excluded.status,
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenants_sync_subscription on public.tenants;
create trigger tenants_sync_subscription
after insert or update of plan, status on public.tenants
for each row execute function public.sync_tenant_subscription();

insert into public.tenant_subscriptions (tenant_id, plan_code, status)
select
  id,
  plan,
  case status
    when 'trial' then 'trialing'
    when 'suspended' then 'suspended'
    when 'cancelled' then 'cancelled'
    else 'active'
  end
from public.tenants
on conflict (tenant_id) do update
set plan_code = excluded.plan_code,
    status = excluded.status,
    updated_at = now();

create or replace function public.app_tenant_resource_usage(target_tenant_id uuid, resource_name text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result integer;
begin
  case resource_name
    when 'companies' then
      select count(*)::integer into result from public.companies where tenant_id = target_tenant_id;
    when 'users' then
      select count(*)::integer into result from public.tenant_members where tenant_id = target_tenant_id and active = true;
    when 'clients' then
      select count(*)::integer into result
      from public.clients c join public.companies co on co.id = c.company_id
      where co.tenant_id = target_tenant_id;
    when 'catalog_items' then
      select (
        (select count(*) from public.products p join public.companies co on co.id = p.company_id where co.tenant_id = target_tenant_id)
        +
        (select count(*) from public.service_catalog s join public.companies co on co.id = s.company_id where co.tenant_id = target_tenant_id)
      )::integer into result;
    when 'recurrences' then
      select (
        (select count(*) from public.contracts c join public.companies co on co.id = c.company_id where co.tenant_id = target_tenant_id and c.status in ('rascunho', 'ativo', 'suspenso'))
        +
        (select count(*) from public.school_enrollments e join public.companies co on co.id = e.company_id where co.tenant_id = target_tenant_id and e.status in ('pendente', 'ativa', 'suspensa'))
      )::integer into result;
    else
      raise exception 'unknown_plan_resource:%', resource_name;
  end case;
  return coalesce(result, 0);
end;
$$;

create or replace function public.app_assert_tenant_capacity(target_tenant_id uuid, resource_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resource_limit integer;
  resource_usage integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_tenant_id::text || ':' || resource_name, 0));

  select (p.limits ->> resource_name)::integer
  into resource_limit
  from public.tenants t
  join public.saas_plans p on p.code = t.plan
  where t.id = target_tenant_id;

  if resource_limit is null then
    return;
  end if;

  resource_usage := public.app_tenant_resource_usage(target_tenant_id, resource_name);
  if resource_usage >= resource_limit then
    raise exception using
      errcode = 'P0001',
      message = 'plan_limit:' || resource_name || ':' || resource_usage || ':' || resource_limit;
  end if;
end;
$$;

create or replace function public.enforce_company_plan_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.app_assert_tenant_capacity(new.tenant_id, 'companies');
  return new;
end;
$$;

create or replace function public.enforce_tenant_member_plan_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and exists (
    select 1 from public.tenant_members
    where tenant_id = new.tenant_id and user_id = new.user_id
  ) then
    return new;
  end if;

  if new.active = true and (tg_op = 'INSERT' or old.active = false) then
    perform public.app_assert_tenant_capacity(new.tenant_id, 'users');
  end if;
  return new;
end;
$$;

create or replace function public.enforce_company_resource_plan_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_tenant_id uuid;
  target_resource text;
begin
  select tenant_id into target_tenant_id from public.companies where id = new.company_id;
  target_resource := tg_argv[0];
  perform public.app_assert_tenant_capacity(target_tenant_id, target_resource);
  return new;
end;
$$;

drop trigger if exists companies_plan_capacity on public.companies;
create trigger companies_plan_capacity
before insert on public.companies
for each row execute function public.enforce_company_plan_capacity();

drop trigger if exists tenant_members_plan_capacity on public.tenant_members;
create trigger tenant_members_plan_capacity
before insert or update of active on public.tenant_members
for each row execute function public.enforce_tenant_member_plan_capacity();

drop trigger if exists clients_plan_capacity on public.clients;
create trigger clients_plan_capacity
before insert on public.clients
for each row execute function public.enforce_company_resource_plan_capacity('clients');

drop trigger if exists products_plan_capacity on public.products;
create trigger products_plan_capacity
before insert on public.products
for each row execute function public.enforce_company_resource_plan_capacity('catalog_items');

drop trigger if exists service_catalog_plan_capacity on public.service_catalog;
create trigger service_catalog_plan_capacity
before insert on public.service_catalog
for each row execute function public.enforce_company_resource_plan_capacity('catalog_items');

drop trigger if exists contracts_plan_capacity on public.contracts;
create trigger contracts_plan_capacity
before insert on public.contracts
for each row execute function public.enforce_company_resource_plan_capacity('recurrences');

drop trigger if exists contracts_reactivation_plan_capacity on public.contracts;
create trigger contracts_reactivation_plan_capacity
before update of status on public.contracts
for each row
when (old.status = 'encerrado' and new.status <> 'encerrado')
execute function public.enforce_company_resource_plan_capacity('recurrences');

drop trigger if exists school_enrollments_plan_capacity on public.school_enrollments;
create trigger school_enrollments_plan_capacity
before insert on public.school_enrollments
for each row execute function public.enforce_company_resource_plan_capacity('recurrences');

drop trigger if exists school_enrollments_reactivation_plan_capacity on public.school_enrollments;
create trigger school_enrollments_reactivation_plan_capacity
before update of status on public.school_enrollments
for each row
when (old.status = 'encerrada' and new.status <> 'encerrada')
execute function public.enforce_company_resource_plan_capacity('recurrences');

alter table public.saas_plans enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.saas_invoices enable row level security;

drop policy if exists saas_plans_authenticated_read on public.saas_plans;
create policy saas_plans_authenticated_read
on public.saas_plans for select to authenticated
using (active = true or public.app_is_system_admin());

drop policy if exists tenant_subscriptions_tenant_read on public.tenant_subscriptions;
create policy tenant_subscriptions_tenant_read
on public.tenant_subscriptions for select to authenticated
using (public.tenant_match(tenant_id) or public.app_is_system_admin());

drop policy if exists tenant_subscriptions_system_admin_all on public.tenant_subscriptions;
create policy tenant_subscriptions_system_admin_all
on public.tenant_subscriptions for all to authenticated
using (public.app_is_system_admin())
with check (public.app_is_system_admin());

drop policy if exists saas_invoices_tenant_read on public.saas_invoices;
create policy saas_invoices_tenant_read
on public.saas_invoices for select to authenticated
using (public.tenant_match(tenant_id) or public.app_is_system_admin());

drop policy if exists saas_invoices_system_admin_all on public.saas_invoices;
create policy saas_invoices_system_admin_all
on public.saas_invoices for all to authenticated
using (public.app_is_system_admin())
with check (public.app_is_system_admin());

revoke all on function public.app_tenant_resource_usage(uuid, text) from public;
revoke all on function public.app_assert_tenant_capacity(uuid, text) from public;
grant execute on function public.app_tenant_resource_usage(uuid, text) to service_role;
grant execute on function public.app_assert_tenant_capacity(uuid, text) to service_role;

commit;
