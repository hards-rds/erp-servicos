begin;

create table if not exists public.commission_sellers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  profile_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text,
  phone text,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_sellers_company_profile_key unique (company_id, profile_id)
);

create table if not exists public.seller_commission_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  commission_seller_id uuid not null references public.commission_sellers(id) on delete cascade,
  source_type text not null check (source_type in ('venda', 'servico')),
  item_key text not null default '*',
  product_id uuid references public.products(id) on delete cascade,
  service_type text,
  rate_percent numeric(7,4) not null check (rate_percent > 0 and rate_percent <= 100),
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_commission_rules_scope_check check (
    (source_type = 'venda' and service_type is null and (
      (item_key = '*' and product_id is null)
      or (item_key <> '*' and product_id is not null and item_key = product_id::text)
    ))
    or
    (source_type = 'servico' and product_id is null and (
      (item_key = '*' and service_type is null)
      or (item_key <> '*' and service_type is not null and item_key = service_type)
    ))
  ),
  constraint seller_commission_rules_unique_scope unique (
    company_id,
    commission_seller_id,
    source_type,
    item_key
  )
);

create index if not exists commission_sellers_company_active_idx
  on public.commission_sellers(company_id, active, name);

create index if not exists seller_commission_rules_lookup_idx
  on public.seller_commission_rules(company_id, commission_seller_id, source_type, item_key)
  where active = true;

insert into public.commission_sellers (
  company_id,
  profile_id,
  name,
  email,
  active,
  created_by,
  updated_by
)
select
  profiles.company_id,
  profiles.id,
  coalesce(nullif(profiles.name, ''), profiles.email),
  profiles.email,
  profiles.active,
  profiles.id,
  profiles.id
from public.profiles profiles
where profiles.company_id is not null
on conflict (company_id, profile_id) do update
set
  name = excluded.name,
  email = excluded.email,
  updated_at = now();

alter table public.commissions
  add column if not exists commission_seller_id uuid;

update public.commissions commissions
set commission_seller_id = sellers.id
from public.commission_sellers sellers
where commissions.commission_seller_id is null
  and sellers.company_id = commissions.company_id
  and sellers.profile_id = commissions.seller_id;

alter table public.commissions
  alter column commission_seller_id set not null,
  alter column seller_id drop not null;

alter table public.commissions
  drop constraint if exists commissions_commission_seller_id_fkey;

alter table public.commissions
  add constraint commissions_commission_seller_id_fkey
  foreign key (commission_seller_id) references public.commission_sellers(id);

create index if not exists commissions_company_commission_seller_date_idx
  on public.commissions(company_id, commission_seller_id, reference_date desc);

alter table public.commission_sellers enable row level security;
alter table public.seller_commission_rules enable row level security;

drop policy if exists commission_sellers_same_company_all on public.commission_sellers;
create policy commission_sellers_same_company_all
on public.commission_sellers
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists seller_commission_rules_same_company_all on public.seller_commission_rules;
create policy seller_commission_rules_same_company_all
on public.seller_commission_rules
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (
  public.app_is_system_admin()
  or (
    public.company_match(company_id)
    and exists (
      select 1
      from public.commission_sellers sellers
      where sellers.id = seller_commission_rules.commission_seller_id
        and sellers.company_id = seller_commission_rules.company_id
    )
  )
);

drop policy if exists commissions_same_company_all on public.commissions;
create policy commissions_same_company_all
on public.commissions
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (
  public.app_is_system_admin()
  or (
    public.company_match(company_id)
    and exists (
      select 1
      from public.commission_sellers sellers
      where sellers.id = commissions.commission_seller_id
        and sellers.company_id = commissions.company_id
    )
  )
);

commit;
