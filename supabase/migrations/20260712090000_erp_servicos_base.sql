create extension if not exists "pgcrypto";

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  document text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key,
  company_id uuid references companies(id),
  email text not null unique,
  name text,
  role text not null default 'usuario' check (role in ('usuario', 'admin', 'master')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  module text not null,
  action text not null check (action in ('visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'cancelar', 'emitir', 'conciliar', 'configurar')),
  scope text not null default 'company',
  unique (module, action, scope)
);

create table if not exists group_permissions (
  group_id uuid not null references groups(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, permission_id)
);

create table if not exists user_groups (
  user_id uuid not null references profiles(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  legal_name text not null,
  trade_name text,
  document text not null,
  municipal_registration text,
  state_registration text,
  fiscal_email text,
  financial_email text,
  phone text,
  address jsonb not null default '{}'::jsonb,
  nfse_data jsonb not null default '{}'::jsonb,
  status text not null default 'ativo' check (status in ('ativo', 'inativo')),
  internal_notes text,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, document)
);

create table if not exists client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text,
  created_at timestamptz not null default now()
);

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  client_id uuid not null references clients(id),
  service_description text not null,
  recurring_amount numeric(14,2) not null check (recurring_amount >= 0),
  periodicity text not null default 'mensal',
  due_day integer not null check (due_day between 1 and 31),
  starts_at date not null,
  ends_at date,
  status text not null default 'rascunho' check (status in ('rascunho', 'ativo', 'suspenso', 'encerrado')),
  fiscal_service_data jsonb not null default '{}'::jsonb,
  auto_issue_nfse boolean not null default false,
  auto_generate_charge boolean not null default false,
  notes text,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists contract_adjustments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id),
  previous_amount numeric(14,2) not null,
  new_amount numeric(14,2) not null,
  effective_at date not null,
  reason text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists financial_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  client_id uuid references clients(id),
  contract_id uuid references contracts(id),
  type text not null check (type in ('recorrente', 'manual', 'avulsa', 'boleto', 'nota_fiscal', 'ajuste')),
  description text not null,
  competence text not null,
  issued_at date,
  due_date date not null,
  received_at date,
  gross_amount numeric(14,2) not null check (gross_amount >= 0),
  discounts numeric(14,2) not null default 0,
  interest numeric(14,2) not null default 0,
  penalty numeric(14,2) not null default 0,
  net_amount numeric(14,2) not null check (net_amount >= 0),
  payment_method text,
  status text not null default 'previsto' check (status in ('previsto', 'emitido', 'aguardando_pagamento', 'recebido', 'vencido', 'cancelado', 'conciliado')),
  charge_id uuid,
  nfse_document_id uuid,
  cancel_reason text,
  idempotency_key text,
  notes text,
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create table if not exists payables (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  vendor_name text not null,
  category text not null,
  description text not null,
  competence text not null,
  due_date date not null,
  paid_at date,
  amount numeric(14,2) not null check (amount >= 0),
  bank_account_id uuid,
  payment_method text,
  status text not null default 'previsto' check (status in ('previsto', 'aprovado', 'pago', 'vencido', 'cancelado', 'conciliado')),
  recurrence jsonb,
  notes text,
  approved_by uuid references profiles(id),
  paid_by uuid references profiles(id),
  reconciled_by uuid references profiles(id),
  created_by uuid references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  bank_name text not null,
  agency text,
  account_number text,
  environment text not null default 'sandbox',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  bank_account_id uuid not null references bank_accounts(id),
  external_id text not null,
  transaction_date date not null,
  description text,
  amount numeric(14,2) not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (bank_account_id, external_id)
);

create table if not exists bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  bank_transaction_id uuid not null references bank_transactions(id),
  financial_entry_id uuid references financial_entries(id),
  payable_id uuid references payables(id),
  difference_amount numeric(14,2) not null default 0,
  justification text,
  reconciled_by uuid references profiles(id),
  reconciled_at timestamptz not null default now()
);

create table if not exists nfse_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  client_id uuid not null references clients(id),
  financial_entry_id uuid references financial_entries(id),
  status text not null default 'rascunho' check (status in ('rascunho', 'validada', 'enfileirada', 'enviada', 'autorizada', 'rejeitada', 'cancelada', 'erro_integracao')),
  competence text not null,
  service_amount numeric(14,2) not null,
  external_id text,
  protocol text,
  request_payload jsonb,
  response_payload jsonb,
  rejection_message text,
  danfse_file_id uuid,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create table if not exists nfse_events (
  id uuid primary key default gen_random_uuid(),
  nfse_document_id uuid not null references nfse_documents(id) on delete cascade,
  status text not null,
  message text,
  payload jsonb,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists boleto_charges (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  financial_entry_id uuid not null references financial_entries(id),
  status text not null default 'rascunho' check (status in ('rascunho', 'solicitada', 'emitida', 'registrada', 'aguardando_pagamento', 'paga', 'vencida', 'cancelada', 'erro_integracao', 'conciliada')),
  external_id text,
  barcode text,
  digitable_line text,
  pix_qr_code text,
  request_payload jsonb,
  response_payload jsonb,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, idempotency_key)
);

create table if not exists api_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  provider text not null,
  environment text not null,
  encrypted_payload text not null,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, provider, environment)
);

create table if not exists digital_certificates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  label text not null,
  encrypted_pfx text not null,
  encrypted_password text not null,
  valid_until date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  provider text,
  email_from text,
  reply_to text,
  templates jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists email_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  recipient text not null,
  subject text not null,
  status text not null,
  provider_message_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  storage_bucket text not null,
  storage_path text not null,
  content_type text,
  sensitive boolean not null default false,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  actor_id uuid references profiles(id),
  entity text not null,
  entity_id uuid,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists clients_company_status_idx on clients(company_id, status);
create index if not exists contracts_client_status_idx on contracts(client_id, status);
create index if not exists financial_entries_company_due_status_idx on financial_entries(company_id, due_date, status);
create index if not exists payables_company_due_status_idx on payables(company_id, due_date, status);
create index if not exists nfse_documents_company_status_idx on nfse_documents(company_id, status);
create index if not exists boleto_charges_company_status_idx on boleto_charges(company_id, status);
create index if not exists audit_logs_company_entity_idx on audit_logs(company_id, entity, created_at desc);

alter table companies enable row level security;
alter table profiles enable row level security;
alter table groups enable row level security;
alter table permissions enable row level security;
alter table group_permissions enable row level security;
alter table user_groups enable row level security;
alter table clients enable row level security;
alter table client_contacts enable row level security;
alter table contracts enable row level security;
alter table contract_adjustments enable row level security;
alter table financial_entries enable row level security;
alter table payables enable row level security;
alter table bank_accounts enable row level security;
alter table bank_transactions enable row level security;
alter table bank_reconciliations enable row level security;
alter table nfse_documents enable row level security;
alter table nfse_events enable row level security;
alter table boleto_charges enable row level security;
alter table api_credentials enable row level security;
alter table digital_certificates enable row level security;
alter table email_settings enable row level security;
alter table email_logs enable row level security;
alter table files enable row level security;
alter table audit_logs enable row level security;
