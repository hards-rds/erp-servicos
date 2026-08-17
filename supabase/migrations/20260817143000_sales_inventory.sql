create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sku text,
  name text not null,
  category text,
  unit text not null default 'un',
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  current_stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0 check (min_stock >= 0),
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sku)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  client_id uuid references public.clients(id),
  sale_date date not null default current_date,
  description text not null,
  gross_amount numeric(14,2) not null check (gross_amount >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  net_amount numeric(14,2) not null check (net_amount >= 0),
  payment_method text,
  status text not null default 'aberta' check (status in ('aberta', 'faturada', 'recebida', 'cancelada')),
  financial_entry_id uuid references public.financial_entries(id),
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  product_id uuid not null references public.products(id),
  sale_id uuid references public.sales(id) on delete set null,
  movement_date date not null default current_date,
  type text not null check (type in ('entrada', 'saida', 'ajuste')),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  reason text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists products_company_active_idx
  on public.products(company_id, active, name);

create index if not exists sales_company_date_idx
  on public.sales(company_id, sale_date desc);

create index if not exists sale_items_sale_idx
  on public.sale_items(sale_id);

create index if not exists stock_movements_company_product_idx
  on public.stock_movements(company_id, product_id, movement_date desc);

alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists products_same_company_all on public.products;
create policy products_same_company_all
on public.products
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists sales_same_company_all on public.sales;
create policy sales_same_company_all
on public.sales
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));

drop policy if exists sale_items_same_company_all on public.sale_items;
create policy sale_items_same_company_all
on public.sale_items
for all to authenticated
using (
  public.app_is_system_admin()
  or exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and public.company_match(s.company_id)
  )
)
with check (
  public.app_is_system_admin()
  or exists (
    select 1
    from public.sales s
    where s.id = sale_items.sale_id
      and public.company_match(s.company_id)
  )
);

drop policy if exists stock_movements_same_company_all on public.stock_movements;
create policy stock_movements_same_company_all
on public.stock_movements
for all to authenticated
using (public.app_is_system_admin() or public.company_match(company_id))
with check (public.app_is_system_admin() or public.company_match(company_id));
