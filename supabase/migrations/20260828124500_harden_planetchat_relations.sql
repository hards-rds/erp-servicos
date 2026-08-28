begin;

drop policy if exists support_orders_same_company_all on public.support_orders;
create policy support_orders_same_company_all on public.support_orders
for all to authenticated
using (
  public.company_match(company_id)
  and (client_id is null or exists (
    select 1 from public.clients c where c.id = client_id and c.company_id = support_orders.company_id
  ))
  and (contract_id is null or exists (
    select 1 from public.contracts c where c.id = contract_id and c.company_id = support_orders.company_id
  ))
)
with check (
  public.company_match(company_id)
  and (client_id is null or exists (
    select 1 from public.clients c where c.id = client_id and c.company_id = support_orders.company_id
  ))
  and (contract_id is null or exists (
    select 1 from public.contracts c where c.id = contract_id and c.company_id = support_orders.company_id
  ))
);

drop policy if exists support_order_events_same_company_all on public.support_order_events;
create policy support_order_events_same_company_all on public.support_order_events
for all to authenticated
using (
  public.company_match(company_id)
  and exists (
    select 1 from public.support_orders s where s.id = support_order_id and s.company_id = support_order_events.company_id
  )
)
with check (
  public.company_match(company_id)
  and exists (
    select 1 from public.support_orders s where s.id = support_order_id and s.company_id = support_order_events.company_id
  )
);

drop policy if exists support_order_messages_same_company_all on public.support_order_messages;
create policy support_order_messages_same_company_all on public.support_order_messages
for all to authenticated
using (
  public.company_match(company_id)
  and exists (
    select 1 from public.support_orders s where s.id = support_order_id and s.company_id = support_order_messages.company_id
  )
)
with check (
  public.company_match(company_id)
  and exists (
    select 1 from public.support_orders s where s.id = support_order_id and s.company_id = support_order_messages.company_id
  )
);

commit;
