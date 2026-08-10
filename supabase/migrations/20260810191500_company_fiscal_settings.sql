begin;

alter table public.companies
  add column if not exists fiscal_settings jsonb not null default '{}'::jsonb;

commit;
