begin;

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  client_id uuid not null references public.clients(id),
  service_description text not null,
  service_type text not null default 'avulso' check (service_type in ('avulso', 'recorrente', 'implantacao', 'suporte', 'consultoria')),
  amount numeric(14,2) not null default 0 check (amount >= 0),
  service_date date not null default current_date,
  due_date date,
  status text not null default 'rascunho' check (status in ('rascunho', 'em_andamento', 'concluido', 'faturado', 'cancelado')),
  fiscal_service_data jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_records_company_status_idx
  on public.service_records(company_id, status, service_date desc);

create index if not exists service_records_client_idx
  on public.service_records(client_id, service_date desc);

alter table public.service_records enable row level security;

insert into public.permissions (module, action, scope)
select 'cadastros.servicos', action, 'company'
from (
  values
    ('visualizar'),
    ('criar'),
    ('editar'),
    ('excluir'),
    ('aprovar'),
    ('cancelar'),
    ('emitir'),
    ('conciliar'),
    ('configurar')
) as actions(action)
on conflict (module, action, scope) do nothing;

drop policy if exists service_records_same_company_all on public.service_records;
create policy service_records_same_company_all
on public.service_records
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module = 'cadastros.servicos'
where g.name = 'Master Geral'
on conflict do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module = 'cadastros.servicos'
where g.name in ('Administração', 'Cadastros', 'Operação')
  and p.action in ('visualizar', 'criar', 'editar', 'cancelar')
on conflict do nothing;

commit;
