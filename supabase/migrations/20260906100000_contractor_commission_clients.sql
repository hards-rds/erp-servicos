begin;

-- NULL preserves participation in all clients for existing contractors.
alter table public.contractors add column if not exists commission_client_ids uuid[];
alter table public.contractors add constraint contractors_commission_clients_nonempty
  check (commission_client_ids is null or (
    cardinality(commission_client_ids) > 0 and array_position(commission_client_ids, null) is null
  ));

create or replace function public.validate_contractor_commission_clients()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.commission_client_ids is not null then
    if exists (
      select 1 from unnest(new.commission_client_ids) as selected(client_id)
      where not exists (
        select 1 from public.clients c
        where c.id = selected.client_id and c.company_id = new.company_id
      )
    ) then
      raise exception 'contractor_commission_invalid_clients';
    end if;
    new.commission_client_ids := array(
      select distinct client_id from unnest(new.commission_client_ids) as selected(client_id) order by client_id
    );
  end if;
  return new;
end;
$$;

create trigger contractors_validate_commission_clients
before insert or update of commission_client_ids, company_id on public.contractors
for each row execute function public.validate_contractor_commission_clients();

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
      and (contractor_record.commission_client_ids is null or c.client_id = any(contractor_record.commission_client_ids))
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
      and (contractor_record.commission_client_ids is null or fe.client_id = any(contractor_record.commission_client_ids))
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


notify pgrst, 'reload schema';
commit;

