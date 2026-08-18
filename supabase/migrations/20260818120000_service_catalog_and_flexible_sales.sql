begin;

create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  code text,
  name text not null,
  description text,
  category text,
  service_type text not null default 'avulso',
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_catalog_company_code_key unique (company_id, code)
);

create index if not exists service_catalog_company_active_name_idx
  on public.service_catalog(company_id, active, name);

alter table public.service_catalog enable row level security;

drop policy if exists service_catalog_same_company_all on public.service_catalog;
create policy service_catalog_same_company_all
on public.service_catalog
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

alter table public.sale_items
  add column if not exists item_type text,
  add column if not exists service_catalog_id uuid references public.service_catalog(id) on delete set null;

update public.sale_items
set item_type = case when product_id is not null then 'produto' else 'servico_avulso' end
where item_type is null;

alter table public.sale_items
  alter column item_type set default 'produto',
  alter column item_type set not null;

alter table public.sale_items
  drop constraint if exists sale_items_item_type_check;

alter table public.sale_items
  add constraint sale_items_item_type_check check (
    (item_type = 'produto' and product_id is not null and service_catalog_id is null)
    or (item_type = 'servico_catalogo' and product_id is null and service_catalog_id is not null)
    or (item_type = 'servico_avulso' and product_id is null and service_catalog_id is null)
  );

create index if not exists sale_items_service_catalog_idx
  on public.sale_items(service_catalog_id)
  where service_catalog_id is not null;

alter table public.seller_commission_rules
  add column if not exists service_catalog_id uuid references public.service_catalog(id) on delete cascade;

alter table public.seller_commission_rules
  drop constraint if exists seller_commission_rules_scope_check;

alter table public.seller_commission_rules
  add constraint seller_commission_rules_scope_check check (
    (source_type = 'venda' and service_type is null and (
      (item_key = '*' and product_id is null and service_catalog_id is null)
      or (
        item_key <> '*'
        and product_id is not null
        and service_catalog_id is null
        and item_key = product_id::text
      )
      or (
        item_key <> '*'
        and product_id is null
        and service_catalog_id is not null
        and item_key = service_catalog_id::text
      )
    ))
    or
    (source_type = 'servico' and product_id is null and service_catalog_id is null and (
      (item_key = '*' and service_type is null)
      or (item_key <> '*' and service_type is not null and item_key = service_type)
    ))
  );

commit;
