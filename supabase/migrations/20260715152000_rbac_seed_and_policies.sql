begin;

alter table profiles
  add constraint profiles_id_auth_users_fk
  foreign key (id) references auth.users(id) on delete cascade
  not valid;

alter table profiles validate constraint profiles_id_auth_users_fk;

create or replace function public.app_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.profiles
  where id = auth.uid()
    and active = true
  limit 1
$$;

create or replace function public.app_is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'master'
      and active = true
  )
$$;

create or replace function public.app_has_permission(permission_module text, permission_action text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.app_is_master()
    or exists (
      select 1
      from public.user_groups ug
      join public.group_permissions gp on gp.group_id = ug.group_id
      join public.permissions p on p.id = gp.permission_id
      where ug.user_id = auth.uid()
        and p.module = permission_module
        and p.action = permission_action
    )
$$;

insert into public.permissions (module, action, scope)
select module, action, 'company'
from (
  values
    ('dashboard'),
    ('cadastros.clientes'),
    ('cadastros.contratos'),
    ('financeiro.entradas'),
    ('financeiro.saidas'),
    ('financeiro.fluxo_caixa'),
    ('financeiro.conciliacao'),
    ('financeiro.cobrancas'),
    ('fiscal.nfse'),
    ('fiscal.notas'),
    ('configuracoes.certificado'),
    ('configuracoes.usuarios'),
    ('configuracoes.grupos'),
    ('configuracoes.apis'),
    ('configuracoes.emails'),
    ('configuracoes.gerais')
) as modules(module)
cross join (
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

create or replace function public.seed_default_erp_groups(target_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.groups (company_id, name, description)
  values
    (target_company_id, 'Master Geral', 'Acesso completo a todos os módulos, usuários, grupos e integrações.'),
    (target_company_id, 'Administração', 'Gestão operacional ampla, sem alteração irrestrita de credenciais críticas.'),
    (target_company_id, 'Financeiro', 'Entradas, saídas, fluxo de caixa, conciliação e cobranças.'),
    (target_company_id, 'Fiscal', 'Validação, emissão e acompanhamento de NFS-e.'),
    (target_company_id, 'Cadastros', 'Clientes, contratos e dados comerciais recorrentes.'),
    (target_company_id, 'Configurações', 'Parâmetros gerais, e-mails, APIs e certificado digital.'),
    (target_company_id, 'Operação', 'Visualização e execução de rotinas operacionais não administrativas.')
  on conflict (company_id, name) do update
  set description = excluded.description,
      active = true,
      updated_at = now();

  insert into public.group_permissions (group_id, permission_id)
  select g.id, p.id
  from public.groups g
  cross join public.permissions p
  where g.company_id = target_company_id
    and g.name = 'Master Geral'
  on conflict do nothing;

  insert into public.group_permissions (group_id, permission_id)
  select g.id, p.id
  from public.groups g
  join public.permissions p on p.module in (
    'dashboard',
    'cadastros.clientes',
    'cadastros.contratos',
    'financeiro.entradas',
    'financeiro.saidas',
    'financeiro.fluxo_caixa',
    'financeiro.conciliacao',
    'financeiro.cobrancas',
    'fiscal.nfse',
    'fiscal.notas'
  )
  where g.company_id = target_company_id
    and g.name = 'Administração'
    and p.action in ('visualizar', 'criar', 'editar', 'aprovar', 'cancelar', 'emitir', 'conciliar')
  on conflict do nothing;

  insert into public.group_permissions (group_id, permission_id)
  select g.id, p.id
  from public.groups g
  join public.permissions p on p.module like 'financeiro.%' or p.module = 'dashboard'
  where g.company_id = target_company_id
    and g.name = 'Financeiro'
    and p.action in ('visualizar', 'criar', 'editar', 'aprovar', 'cancelar', 'conciliar')
  on conflict do nothing;

  insert into public.group_permissions (group_id, permission_id)
  select g.id, p.id
  from public.groups g
  join public.permissions p on p.module like 'fiscal.%' or p.module = 'dashboard'
  where g.company_id = target_company_id
    and g.name = 'Fiscal'
    and p.action in ('visualizar', 'criar', 'editar', 'cancelar', 'emitir')
  on conflict do nothing;

  insert into public.group_permissions (group_id, permission_id)
  select g.id, p.id
  from public.groups g
  join public.permissions p on p.module in ('dashboard', 'cadastros.clientes', 'cadastros.contratos')
  where g.company_id = target_company_id
    and g.name = 'Cadastros'
    and p.action in ('visualizar', 'criar', 'editar')
  on conflict do nothing;

  insert into public.group_permissions (group_id, permission_id)
  select g.id, p.id
  from public.groups g
  join public.permissions p on p.module like 'configuracoes.%'
  where g.company_id = target_company_id
    and g.name = 'Configurações'
    and p.action in ('visualizar', 'editar', 'configurar')
  on conflict do nothing;

  insert into public.group_permissions (group_id, permission_id)
  select g.id, p.id
  from public.groups g
  join public.permissions p on p.module in (
    'dashboard',
    'cadastros.clientes',
    'cadastros.contratos',
    'financeiro.entradas',
    'financeiro.cobrancas',
    'fiscal.nfse',
    'fiscal.notas'
  )
  where g.company_id = target_company_id
    and g.name = 'Operação'
    and p.action in ('visualizar', 'criar', 'editar', 'emitir')
  on conflict do nothing;
end;
$$;

create or replace function public.company_match(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_company_id = public.app_current_company_id()
$$;

create or replace function public.client_company_match(target_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = target_client_id
      and c.company_id = public.app_current_company_id()
  )
$$;

create or replace function public.contract_company_match(target_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contracts c
    where c.id = target_contract_id
      and c.company_id = public.app_current_company_id()
  )
$$;

create or replace function public.nfse_company_match(target_nfse_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nfse_documents n
    where n.id = target_nfse_document_id
      and n.company_id = public.app_current_company_id()
  )
$$;

drop policy if exists companies_same_company_select on public.companies;
create policy companies_same_company_select
on public.companies
for select to authenticated
using (id = public.app_current_company_id() or public.app_is_master());

drop policy if exists profiles_same_company_select on public.profiles;
create policy profiles_same_company_select
on public.profiles
for select to authenticated
using (id = auth.uid() or public.company_match(company_id) or public.app_is_master());

drop policy if exists profiles_master_write on public.profiles;
create policy profiles_master_write
on public.profiles
for all to authenticated
using (public.app_is_master())
with check (public.app_is_master());

drop policy if exists permissions_select_authenticated on public.permissions;
create policy permissions_select_authenticated
on public.permissions
for select to authenticated
using (true);

drop policy if exists permissions_master_write on public.permissions;
create policy permissions_master_write
on public.permissions
for all to authenticated
using (public.app_is_master())
with check (public.app_is_master());

drop policy if exists groups_same_company_select on public.groups;
create policy groups_same_company_select
on public.groups
for select to authenticated
using (public.company_match(company_id) or public.app_is_master());

drop policy if exists groups_master_write on public.groups;
create policy groups_master_write
on public.groups
for all to authenticated
using (public.app_is_master())
with check (public.app_is_master());

drop policy if exists group_permissions_same_company_select on public.group_permissions;
create policy group_permissions_same_company_select
on public.group_permissions
for select to authenticated
using (
  public.app_is_master()
  or exists (
    select 1 from public.groups g
    where g.id = group_permissions.group_id
      and public.company_match(g.company_id)
  )
);

drop policy if exists group_permissions_master_write on public.group_permissions;
create policy group_permissions_master_write
on public.group_permissions
for all to authenticated
using (public.app_is_master())
with check (public.app_is_master());

drop policy if exists user_groups_same_company_select on public.user_groups;
create policy user_groups_same_company_select
on public.user_groups
for select to authenticated
using (
  user_id = auth.uid()
  or public.app_is_master()
  or exists (
    select 1
    from public.profiles p
    where p.id = user_groups.user_id
      and public.company_match(p.company_id)
  )
);

drop policy if exists user_groups_master_write on public.user_groups;
create policy user_groups_master_write
on public.user_groups
for all to authenticated
using (public.app_is_master())
with check (public.app_is_master());

drop policy if exists clients_same_company_all on public.clients;
create policy clients_same_company_all
on public.clients
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists client_contacts_same_company_all on public.client_contacts;
create policy client_contacts_same_company_all
on public.client_contacts
for all to authenticated
using (public.client_company_match(client_id) or public.app_is_master())
with check (public.client_company_match(client_id) or public.app_is_master());

drop policy if exists contracts_same_company_all on public.contracts;
create policy contracts_same_company_all
on public.contracts
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists contract_adjustments_same_company_all on public.contract_adjustments;
create policy contract_adjustments_same_company_all
on public.contract_adjustments
for all to authenticated
using (public.contract_company_match(contract_id) or public.app_is_master())
with check (public.contract_company_match(contract_id) or public.app_is_master());

drop policy if exists financial_entries_same_company_all on public.financial_entries;
create policy financial_entries_same_company_all
on public.financial_entries
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists payables_same_company_all on public.payables;
create policy payables_same_company_all
on public.payables
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists bank_accounts_same_company_all on public.bank_accounts;
create policy bank_accounts_same_company_all
on public.bank_accounts
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists bank_transactions_same_company_all on public.bank_transactions;
create policy bank_transactions_same_company_all
on public.bank_transactions
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists bank_reconciliations_same_company_all on public.bank_reconciliations;
create policy bank_reconciliations_same_company_all
on public.bank_reconciliations
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists nfse_documents_same_company_all on public.nfse_documents;
create policy nfse_documents_same_company_all
on public.nfse_documents
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists nfse_events_same_company_all on public.nfse_events;
create policy nfse_events_same_company_all
on public.nfse_events
for all to authenticated
using (public.nfse_company_match(nfse_document_id) or public.app_is_master())
with check (public.nfse_company_match(nfse_document_id) or public.app_is_master());

drop policy if exists boleto_charges_same_company_all on public.boleto_charges;
create policy boleto_charges_same_company_all
on public.boleto_charges
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists api_credentials_master_all on public.api_credentials;
create policy api_credentials_master_all
on public.api_credentials
for all to authenticated
using (public.app_is_master() and public.company_match(company_id))
with check (public.app_is_master() and public.company_match(company_id));

drop policy if exists digital_certificates_master_all on public.digital_certificates;
create policy digital_certificates_master_all
on public.digital_certificates
for all to authenticated
using (public.app_is_master() and public.company_match(company_id))
with check (public.app_is_master() and public.company_match(company_id));

drop policy if exists email_settings_master_all on public.email_settings;
create policy email_settings_master_all
on public.email_settings
for all to authenticated
using (public.app_is_master() and public.company_match(company_id))
with check (public.app_is_master() and public.company_match(company_id));

drop policy if exists email_logs_same_company_select on public.email_logs;
create policy email_logs_same_company_select
on public.email_logs
for select to authenticated
using (public.company_match(company_id) or public.app_is_master());

drop policy if exists files_same_company_all on public.files;
create policy files_same_company_all
on public.files
for all to authenticated
using (public.company_match(company_id) or public.app_is_master())
with check (public.company_match(company_id) or public.app_is_master());

drop policy if exists audit_logs_same_company_select on public.audit_logs;
create policy audit_logs_same_company_select
on public.audit_logs
for select to authenticated
using (public.company_match(company_id) or public.app_is_master());

grant execute on function public.app_current_company_id() to authenticated;
grant execute on function public.app_is_master() to authenticated;
grant execute on function public.app_has_permission(text, text) to authenticated;
grant execute on function public.seed_default_erp_groups(uuid) to service_role;

commit;
