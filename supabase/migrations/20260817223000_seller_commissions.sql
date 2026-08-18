begin;

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  seller_id uuid not null,
  source_type text not null check (source_type in ('venda', 'servico', 'manual')),
  sale_id uuid unique references public.sales(id) on delete set null,
  service_record_id uuid unique references public.service_records(id) on delete set null,
  payable_id uuid unique references public.payables(id) on delete set null,
  reference_date date not null default current_date,
  description text not null,
  base_amount numeric(14,2) not null check (base_amount >= 0),
  rate_percent numeric(7,4) not null check (rate_percent >= 0 and rate_percent <= 100),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  due_date date not null,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'paga', 'cancelada')),
  paid_at date,
  payment_method text,
  notes text,
  approved_by uuid references public.profiles(id),
  paid_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commissions_seller_id_fkey foreign key (seller_id) references public.profiles(id),
  constraint commissions_source_reference_check check (
    (source_type = 'venda' and sale_id is not null and service_record_id is null)
    or (source_type = 'servico' and service_record_id is not null and sale_id is null)
    or (source_type = 'manual' and sale_id is null and service_record_id is null)
  ),
  constraint commissions_payment_check check (
    status <> 'paga' or (paid_at is not null and payment_method is not null)
  )
);

create index if not exists commissions_company_status_due_idx
  on public.commissions(company_id, status, due_date);

create index if not exists commissions_company_seller_date_idx
  on public.commissions(company_id, seller_id, reference_date desc);

alter table public.commissions enable row level security;

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
      from public.company_members member
      where member.company_id = commissions.company_id
        and member.user_id = commissions.seller_id
        and member.active = true
    )
  )
);

insert into public.permissions (module, action, scope)
select 'financeiro.comissoes', action, 'company'
from (
  values
    ('visualizar'),
    ('criar'),
    ('editar'),
    ('excluir'),
    ('aprovar'),
    ('cancelar'),
    ('conciliar'),
    ('configurar')
) as actions(action)
on conflict (module, action, scope) do nothing;

insert into public.group_permissions (group_id, permission_id)
select groups.id, permissions.id
from public.groups groups
join public.permissions permissions on permissions.module = 'financeiro.comissoes'
where groups.name = 'Master Geral'
on conflict do nothing;

insert into public.group_permissions (group_id, permission_id)
select groups.id, permissions.id
from public.groups groups
join public.permissions permissions on permissions.module = 'financeiro.comissoes'
where groups.name in ('Administracao', 'Administração', 'Financeiro', 'Operacao', 'Operação')
  and permissions.action in ('visualizar', 'criar', 'editar', 'aprovar', 'cancelar', 'conciliar')
on conflict do nothing;

commit;
