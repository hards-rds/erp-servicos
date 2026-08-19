begin;

alter table public.service_catalog
  add column if not exists fiscal_service_data jsonb not null default '{}'::jsonb;

commit;
