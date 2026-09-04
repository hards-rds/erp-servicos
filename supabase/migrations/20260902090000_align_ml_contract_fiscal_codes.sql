begin;

do $$
declare
  target_tenant_id uuid;
  target_company_id uuid;
  template_contract_id uuid;
  template_fiscal_data jsonb;
  updated_contracts integer := 0;
  outside_uberlandia integer := 0;
  city_not_informed integer := 0;
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

  select contract.id, contract.fiscal_service_data
  into template_contract_id, template_fiscal_data
  from public.contracts contract
  join public.clients client
    on client.id = contract.client_id
   and client.company_id = contract.company_id
  where contract.company_id = target_company_id
    and contract.status <> 'encerrado'
    and (
      client.document = '11346803000119'
      or lower(trim(client.legal_name)) like '%fera da borracha%'
    )
  order by contract.updated_at desc
  limit 1;

  if template_contract_id is null then
    raise exception 'Contrato modelo da Fera da Borracha nao encontrado.';
  end if;

  if coalesce(template_fiscal_data ->> 'serviceCode', '') <> '140101'
     or coalesce(template_fiscal_data ->> 'nbsCode', '') <> '120012000' then
    raise exception 'O contrato modelo da Fera da Borracha nao possui os codigos fiscais esperados.';
  end if;

  select
    count(*) filter (
      where trim(coalesce(client.address ->> 'city', '')) <> ''
        and lower(trim(client.address ->> 'city')) not in ('uberlandia', 'uberlândia')
    ),
    count(*) filter (where trim(coalesce(client.address ->> 'city', '')) = '')
  into outside_uberlandia, city_not_informed
  from public.contracts contract
  join public.clients client
    on client.id = contract.client_id
   and client.company_id = contract.company_id
  where contract.company_id = target_company_id
    and contract.status <> 'encerrado';

  update public.contracts contract
  set fiscal_service_data = coalesce(contract.fiscal_service_data, '{}'::jsonb) || jsonb_build_object(
        'provider', coalesce(nullif(template_fiscal_data ->> 'provider', ''), 'nfse_nacional'),
        'serviceCode', template_fiscal_data ->> 'serviceCode',
        'municipalServiceCode', coalesce(template_fiscal_data ->> 'municipalServiceCode', ''),
        'nbsCode', template_fiscal_data ->> 'nbsCode',
        'retainIss', coalesce((template_fiscal_data ->> 'retainIss')::boolean, false)
      ),
      updated_at = now()
  where contract.company_id = target_company_id
    and contract.status <> 'encerrado'
    and (
      contract.fiscal_service_data ->> 'provider' is distinct from coalesce(nullif(template_fiscal_data ->> 'provider', ''), 'nfse_nacional')
      or contract.fiscal_service_data ->> 'serviceCode' is distinct from template_fiscal_data ->> 'serviceCode'
      or contract.fiscal_service_data ->> 'municipalServiceCode' is distinct from coalesce(template_fiscal_data ->> 'municipalServiceCode', '')
      or contract.fiscal_service_data ->> 'nbsCode' is distinct from template_fiscal_data ->> 'nbsCode'
      or contract.fiscal_service_data ->> 'retainIss' is distinct from coalesce(template_fiscal_data ->> 'retainIss', 'false')
    );

  get diagnostics updated_contracts = row_count;

  if exists (
    select 1
    from public.contracts contract
    where contract.company_id = target_company_id
      and contract.status <> 'encerrado'
      and (
        contract.fiscal_service_data ->> 'serviceCode' <> '140101'
        or contract.fiscal_service_data ->> 'nbsCode' <> '120012000'
        or coalesce(contract.fiscal_service_data ->> 'municipalServiceCode', '') <> coalesce(template_fiscal_data ->> 'municipalServiceCode', '')
        or coalesce((contract.fiscal_service_data ->> 'retainIss')::boolean, false) <> coalesce((template_fiscal_data ->> 'retainIss')::boolean, false)
      )
  ) then
    raise exception 'Nem todos os contratos da ML Tecnologia foram atualizados.';
  end if;

  insert into public.audit_logs (
    company_id,
    entity,
    entity_id,
    action,
    reason,
    metadata
  ) values (
    target_company_id,
    'contracts',
    template_contract_id,
    'bulk_update_fiscal_codes',
    'Codigos fiscais dos contratos alinhados ao contrato conferido da Fera da Borracha.',
    jsonb_build_object(
      'templateContractId', template_contract_id,
      'updatedContracts', updated_contracts,
      'serviceCode', template_fiscal_data ->> 'serviceCode',
      'municipalServiceCode', coalesce(template_fiscal_data ->> 'municipalServiceCode', ''),
      'nbsCode', template_fiscal_data ->> 'nbsCode',
      'retainIss', coalesce((template_fiscal_data ->> 'retainIss')::boolean, false),
      'contractsOutsideUberlandia', outside_uberlandia,
      'contractsWithoutCity', city_not_informed
    )
  );

  raise notice 'Contratos atualizados: %. Fora de Uberlandia: %. Cidade nao informada: %.',
    updated_contracts,
    outside_uberlandia,
    city_not_informed;
end;
$$;

commit;
