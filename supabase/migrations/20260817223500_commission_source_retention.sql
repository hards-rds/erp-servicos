begin;

alter table public.commissions
  drop constraint if exists commissions_source_reference_check;

alter table public.commissions
  add constraint commissions_source_reference_check check (
    (source_type = 'venda' and service_record_id is null)
    or (source_type = 'servico' and sale_id is null)
    or (source_type = 'manual' and sale_id is null and service_record_id is null)
  );

commit;
