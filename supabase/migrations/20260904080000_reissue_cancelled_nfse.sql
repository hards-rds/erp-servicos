begin;

alter table public.nfse_documents
  add column if not exists replaces_document_id uuid references public.nfse_documents(id) on delete restrict;

create index if not exists nfse_documents_replaces_document_idx
  on public.nfse_documents(replaces_document_id)
  where replaces_document_id is not null;

create or replace function public.claim_recurrence_run(
  target_company_id uuid,
  target_source_type text,
  target_source_id uuid,
  target_competence text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  claimed_id uuid;
begin
  insert into public.recurrence_runs as existing (company_id, source_type, source_id, competence)
  values (target_company_id, target_source_type, target_source_id, target_competence)
  on conflict (company_id, source_type, source_id, competence)
  do update set
    status = 'processando',
    attempts = existing.attempts + 1,
    error_message = null,
    started_at = now(),
    finished_at = null
  where (
      existing.status in ('erro', 'parcial')
      and existing.finished_at is not null
    )
    or (
      existing.status = 'processando'
      and existing.started_at < now() - interval '15 minutes'
    )
    or (
      existing.status = 'concluido'
      and exists (
        select 1
        from public.nfse_documents document
        where document.id = existing.nfse_document_id
          and document.company_id = existing.company_id
          and document.status = 'cancelada'
      )
    )
  returning id into claimed_id;

  return claimed_id;
end;
$$;

revoke all on function public.claim_recurrence_run(uuid, text, uuid, text) from public;
grant execute on function public.claim_recurrence_run(uuid, text, uuid, text) to service_role;

commit;
