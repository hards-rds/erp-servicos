begin;

create temporary table ml_tecnologia_contract_import (
  client_name text not null,
  recurring_amount numeric(14,2) not null,
  document text not null,
  due_day integer not null,
  nbs_code text not null,
  service_code text not null,
  municipal_service_code text not null,
  fiscal_email text,
  financial_email text,
  service_description text not null
) on commit drop;

insert into ml_tecnologia_contract_import (
  client_name,
  recurring_amount,
  document,
  due_day,
  nbs_code,
  service_code,
  municipal_service_code,
  fiscal_email,
  financial_email,
  service_description
)
values
  ('Healthchess', 7000.00, '17232025000113', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Coopanest', 2500.00, '71017339000149', 20, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Auster', 506.12, '09142059000199', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('HG', 1803.00, '01709651000118', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Central', 2770.00, '38510210000100', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Hosp A Colina', 1370.00, '25382179000110', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Flash', 1495.00, '35248487000100', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Lactowal', 1480.00, '01746448000111', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Saber Contab', 1175.00, '35077974000158', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Mercapecas', 792.00, '02761265000138', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Casa Parabrisa', 512.00, '41810094000141', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Eletrica Jaragua', 660.00, '08458759000124', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Nobile Hotel', 2606.00, '34128628000199', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('JeG', 1321.00, '22896929000183', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Casa dos tubos', 1228.00, '03755347000132', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Ribeiro e Barroso', 745.00, '20799599000182', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Frigorifico Luciana', 8036.00, '21589536000164', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Central', 3228.00, '38510210000100', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Dom bosco', 918.00, '39341658000100', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Celminas', 3340.00, '02222634000114', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Fera da Borracha', 918.00, '11346803000119', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('MGB Contabilidade', 1607.00, '08106183000136', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Barra Proj e Const', 170.00, '02179161000110', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Aço Forte', 960.00, '19086553000137', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Brasil Borrachas', 1900.00, '04329643000215', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Markecode', 750.00, '25357656000197', 10, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.'),
  ('Planetfone', 454.40, '07105582000110', 20, '120012000', '050101', '14.01.01', 'financeiro1@mundolivre.com.br', 'financeiro1@mundolivre.com.br', 'PRESTAÇÃO DE SERVIÇOS EM REDE DE COMPUTADORES E SISTEMAS.');

do $$
declare
  target_tenant_id uuid;
  target_company_id uuid;
  inserted_clients integer := 0;
  updated_clients integer := 0;
  inserted_contracts integer := 0;
begin
  select id
  into target_tenant_id
  from public.tenants
  where slug = 'ml-tecnologia'
     or lower(trim(name)) = 'ml tecnologia'
  order by (slug = 'ml-tecnologia') desc
  limit 1;

  if target_tenant_id is null then
    raise exception 'Tenant ML Tecnologia nao encontrado.';
  end if;

  select id
  into target_company_id
  from public.companies
  where tenant_id = target_tenant_id
    and active = true
  order by created_at
  limit 1;

  if target_company_id is null then
    raise exception 'Empresa ativa do tenant ML Tecnologia nao encontrada.';
  end if;

  insert into public.clients (
    company_id,
    legal_name,
    document,
    fiscal_email,
    financial_email,
    status,
    internal_notes
  )
  select distinct on (source.document)
    target_company_id,
    source.client_name,
    source.document,
    source.fiscal_email,
    source.financial_email,
    'ativo',
    'Importado de imp.xlsx em 31/08/2026.'
  from ml_tecnologia_contract_import source
  where not exists (
    select 1
    from public.clients existing
    where existing.company_id = target_company_id
      and existing.document = source.document
  )
  order by source.document, source.client_name;

  get diagnostics inserted_clients = row_count;

  update public.clients existing
  set fiscal_email = coalesce(existing.fiscal_email, source.fiscal_email),
      financial_email = coalesce(existing.financial_email, source.financial_email),
      updated_at = now()
  from (
    select distinct on (document)
      document,
      fiscal_email,
      financial_email
    from ml_tecnologia_contract_import
    order by document
  ) source
  where existing.company_id = target_company_id
    and existing.document = source.document
    and (
      (existing.fiscal_email is null and source.fiscal_email is not null)
      or (existing.financial_email is null and source.financial_email is not null)
    );

  get diagnostics updated_clients = row_count;

  insert into public.contracts (
    company_id,
    client_id,
    service_description,
    recurring_amount,
    periodicity,
    due_day,
    starts_at,
    status,
    fiscal_service_data,
    auto_generate_financial,
    auto_issue_nfse,
    auto_generate_charge,
    notes
  )
  select
    target_company_id,
    client.id,
    source.service_description,
    source.recurring_amount,
    'mensal',
    source.due_day,
    date '2026-09-01',
    'ativo',
    jsonb_build_object(
      'provider', 'nfse_nacional',
      'serviceCode', source.service_code,
      'municipalServiceCode', source.municipal_service_code,
      'nbsCode', source.nbs_code,
      'retainIss', false
    ),
    false,
    false,
    false,
    'Importado de imp.xlsx. Primeira competencia prevista: 2026-09.'
  from ml_tecnologia_contract_import source
  join public.clients client
    on client.company_id = target_company_id
   and client.document = source.document
  where not exists (
    select 1
    from public.contracts existing
    where existing.company_id = target_company_id
      and existing.client_id = client.id
      and existing.recurring_amount = source.recurring_amount
      and existing.due_day = source.due_day
      and existing.status <> 'encerrado'
  );

  get diagnostics inserted_contracts = row_count;

  insert into public.audit_logs (
    company_id,
    entity,
    action,
    reason,
    metadata
  ) values (
    target_company_id,
    'data_import',
    'import_clients_contracts',
    'Importacao autorizada da planilha imp.xlsx para o tenant ML Tecnologia.',
    jsonb_build_object(
      'sourceFile', 'imp.xlsx',
      'sourceRows', 27,
      'uniqueDocuments', 26,
      'insertedClients', inserted_clients,
      'updatedClients', updated_clients,
      'insertedContracts', inserted_contracts,
      'contractsStartAt', '2026-09-01',
      'expectedMonthlyTotal', 50244.52
    )
  );
end;
$$;

commit;
