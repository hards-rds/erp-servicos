begin;

alter table public.companies
  add column if not exists service_segment text not null default 'tecnologia'
  check (service_segment in ('tecnologia', 'otica', 'generico'));

alter table public.service_records
  drop constraint if exists service_records_service_type_check;

alter table public.service_records
  add constraint service_records_service_type_check
  check (
    service_type in (
      'avulso',
      'recorrente',
      'implantacao',
      'suporte',
      'consultoria',
      'manutencao',
      'visita_tecnica',
      'venda_oculos',
      'lente',
      'armacao',
      'ajuste',
      'exame',
      'garantia'
    )
  );

commit;
