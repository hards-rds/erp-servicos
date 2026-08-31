begin;

create table if not exists public.payable_series (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('installment', 'fixed')),
  vendor_name text not null,
  category text not null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  first_competence text not null check (first_competence ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  first_due_date date not null,
  due_day integer not null check (due_day between 1 and 31),
  installment_count integer,
  default_status text not null default 'previsto' check (default_status in ('previsto', 'aprovado')),
  notes text,
  active boolean not null default true,
  ended_at date,
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payable_series_installments_check check (
    (kind = 'installment' and installment_count between 2 and 120)
    or (kind = 'fixed' and installment_count is null)
  )
);

alter table public.payables
  add column if not exists series_id uuid references public.payable_series(id) on delete restrict,
  add column if not exists installment_number integer,
  add column if not exists installment_total integer;

alter table public.payables drop constraint if exists payables_installment_position_check;
alter table public.payables add constraint payables_installment_position_check check (
  (series_id is null and installment_number is null and installment_total is null)
  or (
    series_id is not null
    and installment_number is not null
    and installment_number >= 1
    and (installment_total is null or installment_total >= installment_number)
  )
);

create unique index if not exists payables_series_competence_unique
  on public.payables(series_id, competence)
  where series_id is not null;
create index if not exists payable_series_company_kind_idx
  on public.payable_series(company_id, kind, active);
create index if not exists payables_company_series_idx
  on public.payables(company_id, series_id);

alter table public.payable_series enable row level security;
drop policy if exists payable_series_same_company_all on public.payable_series;
create policy payable_series_same_company_all on public.payable_series
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

create or replace function public.app_create_payable_schedule(
  target_company_id uuid,
  target_kind text,
  target_vendor_name text,
  target_category text,
  target_description text,
  target_amount numeric,
  target_first_competence text,
  target_first_due_date date,
  target_installment_count integer,
  target_status text,
  target_notes text
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
  created_series_id uuid;
  base_month date;
  target_month date;
  target_due_date date;
  month_last_day integer;
  due_day integer;
  row_amount numeric(14,2);
  total_cents bigint;
  base_cents bigint;
  remainder_cents bigint;
  row_number integer;
  row_total integer;
begin
  if target_company_id is null
    or target_company_id <> public.app_current_company_id()
    or not public.app_has_permission('financeiro.saidas', 'criar') then
    raise exception 'payable_schedule_forbidden';
  end if;
  if target_kind is null
    or target_kind not in ('installment', 'fixed')
    or coalesce(trim(target_vendor_name), '') = ''
    or coalesce(trim(target_category), '') = ''
    or coalesce(trim(target_description), '') = ''
    or target_amount is null
    or round(target_amount, 2) <= 0
    or target_first_competence is null
    or target_first_competence !~ '^\d{4}-(0[1-9]|1[0-2])$'
    or target_first_due_date is null
    or to_char(target_first_due_date, 'YYYY-MM') <> target_first_competence
    or target_status not in ('previsto', 'aprovado')
    or (target_kind = 'installment' and (
      target_installment_count is null
      or target_installment_count not between 2 and 120
      or round(target_amount * 100) < target_installment_count
    ))
    or (target_kind = 'fixed' and target_installment_count is not null) then
    raise exception 'payable_schedule_invalid';
  end if;

  base_month := to_date(target_first_competence || '-01', 'YYYY-MM-DD');
  due_day := extract(day from target_first_due_date)::integer;
  row_total := case when target_kind = 'installment' then target_installment_count else 12 end;

  insert into public.payable_series (
    company_id, kind, vendor_name, category, description, amount,
    first_competence, first_due_date, due_day, installment_count,
    default_status, notes, created_by, updated_by
  ) values (
    target_company_id, target_kind, trim(target_vendor_name), trim(target_category), trim(target_description), round(target_amount, 2),
    target_first_competence, target_first_due_date, due_day,
    case when target_kind = 'installment' then target_installment_count else null end,
    target_status, nullif(trim(target_notes), ''), actor_id, actor_id
  ) returning id into created_series_id;

  if target_kind = 'installment' then
    total_cents := round(target_amount * 100)::bigint;
    base_cents := total_cents / target_installment_count;
    remainder_cents := total_cents % target_installment_count;
  end if;

  for row_number in 1..row_total loop
    target_month := (base_month + make_interval(months => row_number - 1))::date;
    month_last_day := extract(day from (date_trunc('month', target_month) + interval '1 month - 1 day'))::integer;
    target_due_date := make_date(
      extract(year from target_month)::integer,
      extract(month from target_month)::integer,
      least(due_day, month_last_day)
    );
    row_amount := case
      when target_kind = 'installment'
        then (base_cents + case when row_number <= remainder_cents then 1 else 0 end)::numeric / 100
      else round(target_amount, 2)
    end;

    insert into public.payables (
      company_id, vendor_name, category, description, competence, due_date, amount,
      status, recurrence, notes, approved_by, created_by, updated_by,
      series_id, installment_number, installment_total
    ) values (
      target_company_id, trim(target_vendor_name), trim(target_category), trim(target_description),
      to_char(target_month, 'YYYY-MM'), target_due_date, row_amount,
      target_status,
      jsonb_build_object(
        'type', target_kind,
        'seriesId', created_series_id,
        'sequence', row_number,
        'installmentCount', case when target_kind = 'installment' then target_installment_count else null end
      ),
      nullif(trim(target_notes), ''),
      case when target_status = 'aprovado' then actor_id else null end,
      actor_id, actor_id, created_series_id, row_number,
      case when target_kind = 'installment' then target_installment_count else null end
    );
  end loop;

  return created_series_id;
end;
$$;

create or replace function public.ensure_fixed_payable_horizon(
  target_competence text,
  target_company_id uuid default null,
  forecast_months integer default 12
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  series_record public.payable_series%rowtype;
  base_month date;
  target_month date;
  target_due_date date;
  month_last_day integer;
  row_number integer;
  sequence_number integer;
  inserted_count integer := 0;
  affected_count integer;
begin
  if target_competence is null
    or target_competence !~ '^\d{4}-(0[1-9]|1[0-2])$'
    or forecast_months not between 1 and 36 then
    raise exception 'fixed_payable_horizon_invalid';
  end if;

  base_month := to_date(target_competence || '-01', 'YYYY-MM-DD');
  for series_record in
    select *
    from public.payable_series
    where kind = 'fixed'
      and active = true
      and (target_company_id is null or company_id = target_company_id)
  loop
    for row_number in 0..forecast_months - 1 loop
      target_month := (base_month + make_interval(months => row_number))::date;
      if target_month < to_date(series_record.first_competence || '-01', 'YYYY-MM-DD') then
        continue;
      end if;
      month_last_day := extract(day from (date_trunc('month', target_month) + interval '1 month - 1 day'))::integer;
      target_due_date := make_date(
        extract(year from target_month)::integer,
        extract(month from target_month)::integer,
        least(series_record.due_day, month_last_day)
      );
      sequence_number := (
        (extract(year from target_month)::integer - extract(year from series_record.first_due_date)::integer) * 12
        + extract(month from target_month)::integer - extract(month from series_record.first_due_date)::integer
      ) + 1;

      insert into public.payables (
        company_id, vendor_name, category, description, competence, due_date, amount,
        status, recurrence, notes, approved_by, created_by, updated_by,
        series_id, installment_number, installment_total
      ) values (
        series_record.company_id, series_record.vendor_name, series_record.category, series_record.description,
        to_char(target_month, 'YYYY-MM'), target_due_date, series_record.amount,
        series_record.default_status,
        jsonb_build_object('type', 'fixed', 'seriesId', series_record.id, 'sequence', sequence_number),
        series_record.notes,
        case when series_record.default_status = 'aprovado' then series_record.created_by else null end,
        series_record.created_by, series_record.updated_by, series_record.id, sequence_number, null
      ) on conflict (series_id, competence) where series_id is not null do nothing;
      get diagnostics affected_count = row_count;
      inserted_count := inserted_count + affected_count;
    end loop;
  end loop;
  return inserted_count;
end;
$$;

create or replace function public.app_stop_fixed_payable_series(target_series_id uuid)
returns text
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  current_company_id uuid := public.app_current_company_id();
  actor_id uuid := auth.uid();
  series_record public.payable_series%rowtype;
begin
  if current_company_id is null or not public.app_has_permission('financeiro.saidas', 'editar') then
    return 'stop_forbidden';
  end if;
  select * into series_record
  from public.payable_series
  where id = target_series_id
    and company_id = current_company_id
    and kind = 'fixed'
  for update;
  if not found then return 'stop_not_found'; end if;
  if not series_record.active then return 'stop_already'; end if;

  update public.payable_series
  set active = false, ended_at = current_date, updated_by = actor_id, updated_at = now()
  where id = target_series_id and company_id = current_company_id;

  update public.payables
  set status = 'cancelado', updated_by = actor_id, updated_at = now()
  where series_id = target_series_id
    and company_id = current_company_id
    and competence > to_char(current_date, 'YYYY-MM')
    and status in ('previsto', 'aprovado', 'vencido');

  return 'stopped';
end;
$$;

revoke all on function public.app_create_payable_schedule(uuid, text, text, text, text, numeric, text, date, integer, text, text) from public;
revoke all on function public.ensure_fixed_payable_horizon(text, uuid, integer) from public;
revoke all on function public.app_stop_fixed_payable_series(uuid) from public;
grant execute on function public.app_create_payable_schedule(uuid, text, text, text, text, numeric, text, date, integer, text, text) to authenticated;
grant execute on function public.ensure_fixed_payable_horizon(text, uuid, integer) to service_role;
grant execute on function public.app_stop_fixed_payable_series(uuid) to authenticated;

commit;
