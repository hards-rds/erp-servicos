alter table public.financial_entries
  add column if not exists received_amount numeric(14,2) check (received_amount is null or received_amount >= 0),
  add column if not exists payment_notes text;

create index if not exists financial_entries_company_received_idx
  on public.financial_entries(company_id, received_at desc)
  where received_at is not null;
