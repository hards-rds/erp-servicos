-- Parametros de transicao da Reforma Tributaria. A classificacao fiscal permanece
-- por servico/contrato em fiscal_service_data e o documento guarda seu snapshot.
update public.companies
set fiscal_settings = coalesce(fiscal_settings, '{}'::jsonb)
  || jsonb_build_object(
    'ibsStateRate', coalesce(nullif(fiscal_settings ->> 'ibsStateRate', ''), '0.10'),
    'ibsMunicipalRate', coalesce(nullif(fiscal_settings ->> 'ibsMunicipalRate', ''), '0.00'),
    'cbsRate', coalesce(nullif(fiscal_settings ->> 'cbsRate', ''), '0.90'),
    'taxRegimeCode', coalesce(
      nullif(fiscal_settings ->> 'taxRegimeCode', ''),
      case fiscal_settings ->> 'simpleNationalStatus'
        when '1' then '3'
        when '2' then '4'
        when '3' then '1'
        else ''
      end
    )
  ),
  updated_at = now();
