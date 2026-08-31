begin;

create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  legal_name text not null,
  trade_name text,
  tax_id text not null check (tax_id ~ '^\d{14}$'),
  role_title text not null,
  email text,
  phone text,
  pix_key text,
  bank_details jsonb not null default '{}'::jsonb,
  fixed_monthly_amount numeric(14,2) not null default 0 check (fixed_monthly_amount >= 0),
  cost_allowance_amount numeric(14,2) not null default 0 check (cost_allowance_amount >= 0),
  commission_rate numeric(7,4) not null default 0 check (commission_rate between 0 and 100),
  commission_basis text not null default 'contracted' check (commission_basis in ('contracted', 'received')),
  due_day integer not null default 10 check (due_day between 1 and 31),
  starts_at date not null default current_date,
  ends_at date,
  active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, tax_id),
  unique (company_id, id),
  check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.contractor_compensations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contractor_id uuid not null,
  competence text not null check (competence ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  due_date date not null,
  fixed_amount numeric(14,2) not null default 0 check (fixed_amount >= 0),
  cost_allowance_amount numeric(14,2) not null default 0 check (cost_allowance_amount >= 0),
  commission_base numeric(14,2) not null default 0 check (commission_base >= 0),
  commission_rate numeric(7,4) not null default 0 check (commission_rate between 0 and 100),
  commission_amount numeric(14,2) not null default 0 check (commission_amount >= 0),
  adjustments numeric(14,2) not null default 0,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  status text not null default 'rascunho' check (status in ('rascunho', 'aprovado', 'pago', 'cancelado')),
  payable_id uuid unique references public.payables(id) on delete set null,
  approved_by uuid references public.profiles(id),
  paid_at date,
  notes text,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contractor_id, competence),
  unique (company_id, id),
  foreign key (company_id, contractor_id) references public.contractors(company_id, id) on delete restrict
);

create table if not exists public.contractor_compensation_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  compensation_id uuid not null,
  source_type text not null check (source_type in ('contract', 'received_entry')),
  source_key text not null,
  contract_id uuid references public.contracts(id) on delete restrict,
  financial_entry_id uuid references public.financial_entries(id) on delete restrict,
  description text not null,
  base_amount numeric(14,2) not null check (base_amount >= 0),
  rate_percent numeric(7,4) not null check (rate_percent between 0 and 100),
  commission_amount numeric(14,2) not null check (commission_amount >= 0),
  created_at timestamptz not null default now(),
  unique (compensation_id, source_type, source_key),
  foreign key (company_id, compensation_id) references public.contractor_compensations(company_id, id) on delete cascade,
  check (
    (source_type = 'contract' and contract_id is not null and financial_entry_id is null)
    or (source_type = 'received_entry' and financial_entry_id is not null)
  )
);

create index if not exists contractors_company_active_idx on public.contractors(company_id, active, legal_name);
create index if not exists contractor_compensations_company_competence_idx on public.contractor_compensations(company_id, competence, status);
create index if not exists contractor_compensation_items_compensation_idx on public.contractor_compensation_items(compensation_id);

alter table public.contractors enable row level security;
alter table public.contractor_compensations enable row level security;
alter table public.contractor_compensation_items enable row level security;

drop policy if exists contractors_same_company_all on public.contractors;
create policy contractors_same_company_all on public.contractors
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists contractor_compensations_same_company_all on public.contractor_compensations;
create policy contractor_compensations_same_company_all on public.contractor_compensations
for all to authenticated
using (public.company_match(company_id))
with check (
  public.company_match(company_id)
  and exists (
    select 1 from public.contractors c
    where c.id = contractor_id and c.company_id = contractor_compensations.company_id
  )
);

drop policy if exists contractor_compensation_items_same_company_all on public.contractor_compensation_items;
create policy contractor_compensation_items_same_company_all on public.contractor_compensation_items
for all to authenticated
using (public.company_match(company_id))
with check (
  public.company_match(company_id)
  and exists (
    select 1 from public.contractor_compensations cc
    where cc.id = compensation_id and cc.company_id = contractor_compensation_items.company_id
  )
  and (contract_id is null or exists (
    select 1 from public.contracts c
    where c.id = contract_id and c.company_id = contractor_compensation_items.company_id
  ))
  and (financial_entry_id is null or exists (
    select 1 from public.financial_entries fe
    where fe.id = financial_entry_id and fe.company_id = contractor_compensation_items.company_id
  ))
);

insert into public.permissions (module, action, scope)
select 'pessoas.colaboradores', action, 'company'
from unnest(array['visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'cancelar', 'conciliar', 'configurar']) as action
on conflict (module, action, scope) do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module = 'pessoas.colaboradores'
where g.name = 'Master Geral'
on conflict do nothing;

insert into public.group_permissions (group_id, permission_id)
select g.id, p.id
from public.groups g
join public.permissions p on p.module = 'pessoas.colaboradores'
where g.name in ('Administração', 'Administracao', 'Financeiro')
  and p.action in ('visualizar', 'criar', 'editar', 'aprovar', 'cancelar')
on conflict do nothing;

create or replace function public.seed_contractor_permissions_for_group()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.name = 'Master Geral' then
    insert into public.group_permissions (group_id, permission_id)
    select new.id, p.id
    from public.permissions p
    where p.module = 'pessoas.colaboradores'
    on conflict do nothing;
  elsif new.name in ('Administração', 'Administracao', 'Financeiro') then
    insert into public.group_permissions (group_id, permission_id)
    select new.id, p.id
    from public.permissions p
    where p.module = 'pessoas.colaboradores'
      and p.action in ('visualizar', 'criar', 'editar', 'aprovar', 'cancelar')
    on conflict do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists groups_seed_contractor_permissions on public.groups;
create trigger groups_seed_contractor_permissions
after insert on public.groups
for each row execute function public.seed_contractor_permissions_for_group();

create or replace function public.app_generate_contractor_compensation(
  target_contractor_id uuid,
  target_competence text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_company_id uuid := public.app_current_company_id();
  actor_id uuid := auth.uid();
  contractor_record public.contractors%rowtype;
  compensation_record public.contractor_compensations%rowtype;
  competence_start date;
  competence_end date;
  calculated_due_date date;
  month_last_day integer;
  calculated_base numeric(14,2);
  calculated_commission numeric(14,2);
begin
  if current_company_id is null or not public.app_has_permission('pessoas.colaboradores', 'criar') then
    raise exception 'contractor_compensation_forbidden';
  end if;
  if target_competence is null or target_competence !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'contractor_compensation_invalid_competence';
  end if;

  competence_start := to_date(target_competence || '-01', 'YYYY-MM-DD');
  competence_end := (competence_start + interval '1 month - 1 day')::date;

  select * into contractor_record
  from public.contractors
  where id = target_contractor_id
    and company_id = current_company_id
    and active = true
    and starts_at <= competence_end
    and (ends_at is null or ends_at >= competence_start)
  for update;
  if not found then raise exception 'contractor_not_active'; end if;

  select * into compensation_record
  from public.contractor_compensations
  where company_id = current_company_id
    and contractor_id = target_contractor_id
    and competence = target_competence
  for update;
  if found and compensation_record.status <> 'rascunho' then
    raise exception 'contractor_compensation_locked';
  end if;

  month_last_day := extract(day from competence_end)::integer;
  calculated_due_date := make_date(
    extract(year from competence_start)::integer,
    extract(month from competence_start)::integer,
    least(contractor_record.due_day, month_last_day)
  );

  if not found then
    insert into public.contractor_compensations (
      company_id, contractor_id, competence, due_date, fixed_amount,
      cost_allowance_amount, commission_rate, status, created_by, updated_by
    ) values (
      current_company_id, contractor_record.id, target_competence, calculated_due_date,
      contractor_record.fixed_monthly_amount, contractor_record.cost_allowance_amount,
      contractor_record.commission_rate, 'rascunho', actor_id, actor_id
    ) returning * into compensation_record;
  else
    update public.contractor_compensations
    set due_date = calculated_due_date,
        fixed_amount = contractor_record.fixed_monthly_amount,
        cost_allowance_amount = contractor_record.cost_allowance_amount,
        commission_rate = contractor_record.commission_rate,
        updated_by = actor_id,
        updated_at = now()
    where id = compensation_record.id
    returning * into compensation_record;
  end if;

  delete from public.contractor_compensation_items where compensation_id = compensation_record.id;

  if contractor_record.commission_rate > 0 and contractor_record.commission_basis = 'contracted' then
    insert into public.contractor_compensation_items (
      company_id, compensation_id, source_type, source_key, contract_id,
      description, base_amount, rate_percent, commission_amount
    )
    select
      current_company_id, compensation_record.id, 'contract', c.id::text, c.id,
      coalesce(nullif(cl.trade_name, ''), cl.legal_name) || ' · ' || c.service_description,
      round(c.recurring_amount, 2), contractor_record.commission_rate,
      round(c.recurring_amount * contractor_record.commission_rate / 100, 2)
    from public.contracts c
    join public.clients cl on cl.id = c.client_id and cl.company_id = c.company_id
    where c.company_id = current_company_id
      and c.status = 'ativo'
      and c.starts_at <= competence_end
      and (c.ends_at is null or c.ends_at >= competence_start)
      and mod(
        (extract(year from competence_start)::integer - extract(year from date_trunc('month', c.starts_at))::integer) * 12
        + extract(month from competence_start)::integer - extract(month from date_trunc('month', c.starts_at))::integer,
        case c.periodicity when 'trimestral' then 3 when 'semestral' then 6 when 'anual' then 12 else 1 end
      ) = 0;
  elsif contractor_record.commission_rate > 0 and contractor_record.commission_basis = 'received' then
    insert into public.contractor_compensation_items (
      company_id, compensation_id, source_type, source_key, contract_id, financial_entry_id,
      description, base_amount, rate_percent, commission_amount
    )
    select
      current_company_id, compensation_record.id, 'received_entry', fe.id::text, fe.contract_id, fe.id,
      coalesce(nullif(cl.trade_name, ''), cl.legal_name) || ' · ' || fe.description,
      round(coalesce(fe.received_amount, fe.net_amount), 2), contractor_record.commission_rate,
      round(coalesce(fe.received_amount, fe.net_amount) * contractor_record.commission_rate / 100, 2)
    from public.financial_entries fe
    join public.clients cl on cl.id = fe.client_id and cl.company_id = fe.company_id
    where fe.company_id = current_company_id
      and fe.contract_id is not null
      and fe.status in ('recebido', 'conciliado')
      and fe.received_at is not null
      and to_char(fe.received_at, 'YYYY-MM') = target_competence;
  end if;

  select coalesce(sum(base_amount), 0), coalesce(sum(commission_amount), 0)
  into calculated_base, calculated_commission
  from public.contractor_compensation_items
  where compensation_id = compensation_record.id;

  update public.contractor_compensations
  set commission_base = round(calculated_base, 2),
      commission_amount = round(calculated_commission, 2),
      total_amount = round(fixed_amount + cost_allowance_amount + calculated_commission + adjustments, 2),
      updated_by = actor_id,
      updated_at = now()
  where id = compensation_record.id;

  return compensation_record.id;
end;
$$;

create or replace function public.app_approve_contractor_compensation(target_compensation_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_company_id uuid := public.app_current_company_id();
  actor_id uuid := auth.uid();
  compensation_record public.contractor_compensations%rowtype;
  contractor_record public.contractors%rowtype;
  created_payable_id uuid;
  vendor_label text;
begin
  if current_company_id is null or not public.app_has_permission('pessoas.colaboradores', 'aprovar') then
    raise exception 'contractor_compensation_forbidden';
  end if;

  select * into compensation_record
  from public.contractor_compensations
  where id = target_compensation_id and company_id = current_company_id
  for update;
  if not found then raise exception 'contractor_compensation_not_found'; end if;
  if compensation_record.status = 'aprovado' and compensation_record.payable_id is not null then
    return compensation_record.payable_id;
  end if;
  if compensation_record.status <> 'rascunho' or compensation_record.total_amount <= 0 then
    raise exception 'contractor_compensation_cannot_approve';
  end if;

  select * into contractor_record
  from public.contractors
  where id = compensation_record.contractor_id and company_id = current_company_id;
  vendor_label := coalesce(nullif(contractor_record.trade_name, ''), contractor_record.legal_name);

  insert into public.payables (
    company_id, vendor_name, category, description, competence, due_date, amount,
    status, recurrence, notes, approved_by, created_by, updated_by
  ) values (
    current_company_id, vendor_label, 'Prestadores PJ',
    'Remuneracao PJ ' || compensation_record.competence || ' - ' || vendor_label,
    compensation_record.competence, compensation_record.due_date, compensation_record.total_amount,
    'aprovado',
    jsonb_build_object('type', 'contractor_compensation', 'compensationId', compensation_record.id),
    'Fixo: ' || to_char(compensation_record.fixed_amount, 'FM999999990D00')
      || ' · Ajuda de custo: ' || to_char(compensation_record.cost_allowance_amount, 'FM999999990D00')
      || ' · Comissao: ' || to_char(compensation_record.commission_amount, 'FM999999990D00'),
    actor_id, actor_id, actor_id
  ) returning id into created_payable_id;

  update public.contractor_compensations
  set status = 'aprovado', payable_id = created_payable_id, approved_by = actor_id,
      updated_by = actor_id, updated_at = now()
  where id = compensation_record.id;

  return created_payable_id;
end;
$$;

create or replace function public.app_cancel_contractor_compensation(target_compensation_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_company_id uuid := public.app_current_company_id();
  actor_id uuid := auth.uid();
  compensation_record public.contractor_compensations%rowtype;
  payable_status text;
begin
  if current_company_id is null or not public.app_has_permission('pessoas.colaboradores', 'cancelar') then
    return 'forbidden';
  end if;

  select * into compensation_record
  from public.contractor_compensations
  where id = target_compensation_id and company_id = current_company_id
  for update;
  if not found then return 'not_found'; end if;
  if compensation_record.status = 'pago' then return 'paid'; end if;
  if compensation_record.status = 'cancelado' then return 'cancelled'; end if;

  if compensation_record.payable_id is not null then
    select status into payable_status
    from public.payables
    where id = compensation_record.payable_id and company_id = current_company_id
    for update;
    if payable_status in ('pago', 'conciliado') then return 'paid'; end if;
    if exists (
      select 1 from public.bank_reconciliations br
      where br.payable_id = compensation_record.payable_id and br.company_id = current_company_id
    ) then return 'reconciled'; end if;
    update public.payables
    set status = 'cancelado', updated_by = actor_id, updated_at = now()
    where id = compensation_record.payable_id and company_id = current_company_id;
  end if;

  update public.contractor_compensations
  set status = 'cancelado', updated_by = actor_id, updated_at = now()
  where id = compensation_record.id;
  return 'cancelled';
end;
$$;

create or replace function public.sync_contractor_compensation_from_payable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status in ('pago', 'conciliado') and old.status is distinct from new.status then
    update public.contractor_compensations
    set status = 'pago', paid_at = coalesce(new.paid_at, current_date), updated_by = new.updated_by, updated_at = now()
    where payable_id = new.id and company_id = new.company_id and status <> 'pago';
  elsif new.status = 'cancelado' and old.status is distinct from new.status then
    update public.contractor_compensations
    set status = 'cancelado', updated_by = new.updated_by, updated_at = now()
    where payable_id = new.id and company_id = new.company_id and status not in ('pago', 'cancelado');
  end if;
  return new;
end;
$$;

drop trigger if exists payables_sync_contractor_compensation on public.payables;
create trigger payables_sync_contractor_compensation
after update of status, paid_at on public.payables
for each row execute function public.sync_contractor_compensation_from_payable();

revoke all on function public.app_generate_contractor_compensation(uuid, text) from public;
revoke all on function public.app_approve_contractor_compensation(uuid) from public;
revoke all on function public.app_cancel_contractor_compensation(uuid) from public;
grant execute on function public.app_generate_contractor_compensation(uuid, text) to authenticated;
grant execute on function public.app_approve_contractor_compensation(uuid) to authenticated;
grant execute on function public.app_cancel_contractor_compensation(uuid) to authenticated;

commit;
