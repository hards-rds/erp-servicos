begin;

alter table public.contracts
  add column if not exists auto_generate_financial boolean not null default false;

alter table public.school_enrollments
  add column if not exists auto_generate_financial boolean not null default false;

create table if not exists public.recurrence_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type text not null check (source_type in ('contract', 'school_enrollment')),
  source_id uuid not null,
  competence text not null check (competence ~ '^\d{4}-\d{2}$'),
  status text not null default 'processando' check (status in ('processando', 'concluido', 'parcial', 'erro', 'ignorado')),
  financial_entry_id uuid references public.financial_entries(id) on delete set null,
  nfse_document_id uuid references public.nfse_documents(id) on delete set null,
  boleto_charge_id uuid references public.boleto_charges(id) on delete set null,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  attempts integer not null default 1,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (company_id, source_type, source_id, competence)
);

create index if not exists recurrence_runs_company_started_idx
  on public.recurrence_runs(company_id, started_at desc);

create or replace function public.claim_recurrence_run(
  target_company_id uuid,
  target_source_type text,
  target_source_id uuid,
  target_competence text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  insert into public.recurrence_runs as existing (company_id, source_type, source_id, competence)
  values (target_company_id, target_source_type, target_source_id, target_competence)
  on conflict (company_id, source_type, source_id, competence)
  do update set
    status = 'processando',
    attempts = existing.attempts + 1,
    error_message = null,
    started_at = now(),
    finished_at = null
  where existing.status in ('erro', 'parcial')
    and coalesce(existing.finished_at, existing.started_at) < now() - interval '5 minutes'
  returning id into claimed_id;

  return claimed_id;
end;
$$;

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  category text not null check (category in ('recorrencia', 'financeiro', 'fiscal', 'cobranca', 'sistema')),
  severity text not null default 'info' check (severity in ('info', 'sucesso', 'aviso', 'erro')),
  title text not null,
  message text not null,
  link text,
  entity_type text,
  entity_id uuid,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, dedupe_key)
);

create index if not exists app_notifications_company_unread_idx
  on public.app_notifications(company_id, read_at, created_at desc);

alter table public.recurrence_runs enable row level security;
alter table public.app_notifications enable row level security;

drop policy if exists recurrence_runs_same_company_select on public.recurrence_runs;
create policy recurrence_runs_same_company_select
on public.recurrence_runs for select to authenticated
using (public.company_match(company_id));

drop policy if exists app_notifications_same_company_select on public.app_notifications;
create policy app_notifications_same_company_select
on public.app_notifications for select to authenticated
using (
  public.company_match(company_id)
  and (profile_id is null or profile_id = auth.uid())
);

drop policy if exists app_notifications_same_company_update on public.app_notifications;
create policy app_notifications_same_company_update
on public.app_notifications for update to authenticated
using (
  public.company_match(company_id)
  and (profile_id is null or profile_id = auth.uid())
)
with check (
  public.company_match(company_id)
  and (profile_id is null or profile_id = auth.uid())
);

revoke all on function public.claim_recurrence_run(uuid, text, uuid, text) from public;
grant execute on function public.claim_recurrence_run(uuid, text, uuid, text) to service_role;
revoke update on table public.app_notifications from authenticated;
grant update (read_at) on table public.app_notifications to authenticated;

commit;
