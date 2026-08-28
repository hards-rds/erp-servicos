begin;

create table if not exists public.support_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  contract_id uuid references public.contracts(id) on delete set null,
  provider text not null default 'planetchat',
  external_id text not null,
  protocol text,
  status_code integer,
  status_label text not null default 'desconhecido',
  chat_id text,
  contact_id text,
  contact_name text,
  contact_email text,
  contact_phone text,
  source text,
  source_name text,
  identifier text,
  channel_id text,
  channel_name text,
  channel_type text,
  queue_id text,
  queue_name text,
  service_group_id text,
  attendant_id text,
  attendant_name text,
  attendant_email text,
  started_at timestamptz,
  queued_at timestamptz,
  first_attended_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  wait_seconds integer,
  service_seconds integer,
  avg_client_response_seconds integer,
  avg_agent_response_seconds integer,
  survey_score numeric(6,2),
  template boolean not null default false,
  has_alert_words boolean not null default false,
  labels jsonb not null default '[]'::jsonb,
  qualification_response jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  match_status text not null default 'nao_vinculado'
    check (match_status in ('vinculado', 'cliente_vinculado', 'ambiguo', 'nao_vinculado', 'manual')),
  first_synced_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider, external_id)
);

create index if not exists support_orders_company_started_idx
  on public.support_orders(company_id, started_at desc);
create index if not exists support_orders_company_client_idx
  on public.support_orders(company_id, client_id, started_at desc);
create index if not exists support_orders_company_contract_idx
  on public.support_orders(company_id, contract_id, started_at desc);
create index if not exists support_orders_company_attendant_idx
  on public.support_orders(company_id, attendant_id, started_at desc);

create table if not exists public.support_order_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  support_order_id uuid not null references public.support_orders(id) on delete cascade,
  provider text not null default 'planetchat',
  external_id text not null,
  action text not null,
  occurred_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (support_order_id, provider, external_id)
);

create index if not exists support_order_events_order_date_idx
  on public.support_order_events(support_order_id, occurred_at);

create table if not exists public.support_order_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  support_order_id uuid not null references public.support_orders(id) on delete cascade,
  provider text not null default 'planetchat',
  external_id text not null,
  external_customer_service_id text,
  external_chat_id text,
  direction text,
  message_type text,
  text_content text,
  delivery_status text,
  from_bot boolean not null default false,
  from_system boolean not null default false,
  sent_by text,
  sent_by_name text,
  attachments jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (support_order_id, provider, external_id)
);

create index if not exists support_order_messages_order_date_idx
  on public.support_order_messages(support_order_id, sent_at);

create table if not exists public.planetchat_attendant_metrics (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  external_user_id text not null,
  user_name text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_customer_services integer not null default 0,
  closed_customer_services integer not null default 0,
  average_survey_score numeric(8,2),
  answered_surveys integer not null default 0,
  total_messages integer not null default 0,
  received_messages integer not null default 0,
  sent_messages_total integer not null default 0,
  sent_messages_error integer not null default 0,
  sent_messages_sent integer not null default 0,
  sent_messages_delivered integer not null default 0,
  sent_messages_read integer not null default 0,
  tmu_seconds numeric(14,2),
  tmia_seconds numeric(14,2),
  tma_seconds numeric(14,2),
  raw_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, external_user_id, period_start, period_end)
);

create index if not exists planetchat_attendant_metrics_company_period_idx
  on public.planetchat_attendant_metrics(company_id, period_start desc, period_end desc);

create table if not exists public.planetchat_sync_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  requested_by uuid references public.profiles(id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  status text not null default 'executando'
    check (status in ('executando', 'concluido', 'parcial', 'erro')),
  support_orders_received integer not null default 0,
  support_orders_upserted integer not null default 0,
  events_upserted integer not null default 0,
  messages_upserted integer not null default 0,
  metrics_upserted integer not null default 0,
  matched_clients integer not null default 0,
  matched_contracts integer not null default 0,
  warning_message text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists planetchat_sync_runs_company_date_idx
  on public.planetchat_sync_runs(company_id, started_at desc);

alter table public.support_orders enable row level security;
alter table public.support_order_events enable row level security;
alter table public.support_order_messages enable row level security;
alter table public.planetchat_attendant_metrics enable row level security;
alter table public.planetchat_sync_runs enable row level security;

drop policy if exists support_orders_same_company_all on public.support_orders;
create policy support_orders_same_company_all on public.support_orders
for all to authenticated
using (
  public.company_match(company_id)
  and (client_id is null or exists (
    select 1 from public.clients c where c.id = client_id and c.company_id = support_orders.company_id
  ))
  and (contract_id is null or exists (
    select 1 from public.contracts c where c.id = contract_id and c.company_id = support_orders.company_id
  ))
)
with check (
  public.company_match(company_id)
  and (client_id is null or exists (
    select 1 from public.clients c where c.id = client_id and c.company_id = support_orders.company_id
  ))
  and (contract_id is null or exists (
    select 1 from public.contracts c where c.id = contract_id and c.company_id = support_orders.company_id
  ))
);

drop policy if exists support_order_events_same_company_all on public.support_order_events;
create policy support_order_events_same_company_all on public.support_order_events
for all to authenticated
using (
  public.company_match(company_id)
  and exists (
    select 1 from public.support_orders s where s.id = support_order_id and s.company_id = support_order_events.company_id
  )
)
with check (
  public.company_match(company_id)
  and exists (
    select 1 from public.support_orders s where s.id = support_order_id and s.company_id = support_order_events.company_id
  )
);

drop policy if exists support_order_messages_same_company_all on public.support_order_messages;
create policy support_order_messages_same_company_all on public.support_order_messages
for all to authenticated
using (
  public.company_match(company_id)
  and exists (
    select 1 from public.support_orders s where s.id = support_order_id and s.company_id = support_order_messages.company_id
  )
)
with check (
  public.company_match(company_id)
  and exists (
    select 1 from public.support_orders s where s.id = support_order_id and s.company_id = support_order_messages.company_id
  )
);

drop policy if exists planetchat_attendant_metrics_same_company_all on public.planetchat_attendant_metrics;
create policy planetchat_attendant_metrics_same_company_all on public.planetchat_attendant_metrics
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists planetchat_sync_runs_same_company_all on public.planetchat_sync_runs;
create policy planetchat_sync_runs_same_company_all on public.planetchat_sync_runs
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

create or replace function public.planetchat_support_summary(
  p_company_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  total bigint,
  closed bigint,
  matched bigint,
  total_service_seconds numeric,
  average_wait_seconds numeric,
  average_service_seconds numeric,
  average_survey_score numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::bigint,
    count(*) filter (where status_code = 4)::bigint,
    count(*) filter (where client_id is not null)::bigint,
    coalesce(sum(service_seconds), 0)::numeric,
    coalesce(avg(wait_seconds), 0)::numeric,
    coalesce(avg(service_seconds), 0)::numeric,
    avg(survey_score)::numeric
  from public.support_orders
  where company_id = p_company_id
    and started_at >= p_from
    and started_at <= p_to
    and public.company_match(company_id);
$$;

revoke all on function public.planetchat_support_summary(uuid, timestamptz, timestamptz) from public;
grant execute on function public.planetchat_support_summary(uuid, timestamptz, timestamptz) to authenticated;

commit;
