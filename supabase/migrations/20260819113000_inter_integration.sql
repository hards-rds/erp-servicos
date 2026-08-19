begin;

alter table public.api_credentials
  add column if not exists active boolean not null default false,
  add column if not exists config_summary jsonb not null default '{}'::jsonb;

create unique index if not exists api_credentials_one_active_provider_idx
  on public.api_credentials(company_id, provider)
  where active;

create or replace function public.activate_api_credential(
  p_company_id uuid,
  p_provider text,
  p_environment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.api_credentials
    where company_id = p_company_id
      and provider = p_provider
      and environment = p_environment
  ) then
    raise exception 'Credencial alvo nao encontrada';
  end if;

  update public.api_credentials
  set active = (environment = p_environment),
      updated_at = now()
  where company_id = p_company_id
    and provider = p_provider;
end;
$$;

revoke all on function public.activate_api_credential(uuid, text, text) from public;
grant execute on function public.activate_api_credential(uuid, text, text) to service_role;

alter table public.boleto_charges
  add column if not exists paid_at timestamptz,
  add column if not exists paid_amount numeric(14,2),
  add column if not exists payment_method text,
  add column if not exists pdf_file_id uuid references public.files(id) on delete set null,
  add column if not exists last_synced_at timestamptz,
  add column if not exists rejection_message text;

create unique index if not exists boleto_charges_external_id_idx
  on public.boleto_charges(external_id)
  where external_id is not null;

create table if not exists public.boleto_charge_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  boleto_charge_id uuid not null references public.boleto_charges(id) on delete cascade,
  event_key text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (boleto_charge_id, event_key)
);

create index if not exists boleto_charge_events_company_created_idx
  on public.boleto_charge_events(company_id, created_at desc);

alter table public.boleto_charge_events enable row level security;

drop policy if exists boleto_charge_events_same_company_all on public.boleto_charge_events;
create policy boleto_charge_events_same_company_all
on public.boleto_charge_events
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

commit;
