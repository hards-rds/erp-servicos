begin;

create or replace function public.delete_sale_with_effects(target_sale_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_company_id uuid;
  current_actor_id uuid := auth.uid();
  sale_record public.sales%rowtype;
  linked_nfse_id uuid;
  linked_charge_id uuid;
  linked_commission_id uuid;
  linked_commission_status text;
  linked_payable_id uuid;
begin
  current_company_id := public.app_current_company_id();

  if current_company_id is null
    or not public.app_has_permission('financeiro.entradas', 'excluir') then
    return 'delete_forbidden';
  end if;

  select *
  into sale_record
  from public.sales
  where id = target_sale_id
    and company_id = current_company_id
  for update;

  if not found then
    return 'delete_not_found';
  end if;

  if sale_record.financial_entry_id is not null then
    select nfse_document_id, charge_id
    into linked_nfse_id, linked_charge_id
    from public.financial_entries
    where id = sale_record.financial_entry_id
      and company_id = current_company_id
    for update;

    if exists (
      select 1
      from public.nfse_documents document
      where document.company_id = current_company_id
        and (
          document.financial_entry_id = sale_record.financial_entry_id
          or document.id = linked_nfse_id
        )
        and (
          document.status in ('enviada', 'autorizada', 'cancelada')
          or document.external_id is not null
          or document.protocol is not null
        )
    ) then
      return 'delete_nfse';
    end if;

    if exists (
      select 1
      from public.boleto_charges charge
      where charge.company_id = current_company_id
        and (
          charge.financial_entry_id = sale_record.financial_entry_id
          or charge.id = linked_charge_id
        )
        and (
          charge.status in ('paga', 'conciliada')
          or (charge.external_id is not null and charge.status <> 'cancelada')
        )
    ) then
      return 'delete_charge';
    end if;

    if exists (
      select 1
      from public.bank_reconciliations reconciliation
      where reconciliation.company_id = current_company_id
        and reconciliation.financial_entry_id = sale_record.financial_entry_id
    ) then
      return 'delete_reconciliation';
    end if;
  end if;

  select commission.id, commission.status, commission.payable_id
  into linked_commission_id, linked_commission_status, linked_payable_id
  from public.commissions commission
  where commission.company_id = current_company_id
    and commission.sale_id = sale_record.id
  limit 1
  for update;

  if linked_commission_id is not null and (
    linked_commission_status = 'paga'
    or exists (
      select 1
      from public.payables payable
      where payable.id = linked_payable_id
        and payable.company_id = current_company_id
        and payable.status in ('pago', 'conciliado')
    )
    or exists (
      select 1
      from public.bank_reconciliations reconciliation
      where reconciliation.company_id = current_company_id
        and reconciliation.payable_id = linked_payable_id
    )
  ) then
    return 'delete_commission_paid';
  end if;

  update public.products product
  set current_stock = product.current_stock + sold.quantity,
      updated_by = current_actor_id,
      updated_at = now()
  from (
    select item.product_id, sum(item.quantity) as quantity
    from public.sale_items item
    where item.sale_id = sale_record.id
      and item.item_type = 'produto'
      and item.product_id is not null
    group by item.product_id
  ) sold
  where product.id = sold.product_id
    and product.company_id = current_company_id;

  delete from public.stock_movements
  where sale_id = sale_record.id
    and company_id = current_company_id;

  if linked_commission_id is not null then
    delete from public.commissions
    where id = linked_commission_id
      and company_id = current_company_id;

    if linked_payable_id is not null then
      delete from public.payables
      where id = linked_payable_id
        and company_id = current_company_id;
    end if;
  end if;

  if sale_record.financial_entry_id is not null then
    delete from public.nfse_documents
    where company_id = current_company_id
      and (
        financial_entry_id = sale_record.financial_entry_id
        or id = linked_nfse_id
      );

    delete from public.boleto_charges
    where company_id = current_company_id
      and (
        financial_entry_id = sale_record.financial_entry_id
        or id = linked_charge_id
      );

    update public.financial_entries
    set nfse_document_id = null,
        charge_id = null,
        updated_by = current_actor_id,
        updated_at = now()
    where id = sale_record.financial_entry_id
      and company_id = current_company_id;
  end if;

  update public.sales
  set financial_entry_id = null,
      updated_by = current_actor_id,
      updated_at = now()
  where id = sale_record.id
    and company_id = current_company_id;

  delete from public.sales
  where id = sale_record.id
    and company_id = current_company_id;

  if sale_record.financial_entry_id is not null then
    delete from public.financial_entries
    where id = sale_record.financial_entry_id
      and company_id = current_company_id;
  end if;

  insert into public.audit_logs (
    company_id,
    actor_id,
    entity,
    entity_id,
    action,
    reason,
    metadata
  ) values (
    current_company_id,
    current_actor_id,
    'sale',
    sale_record.id,
    'delete',
    'Venda excluida pelo operador.',
    jsonb_build_object(
      'description', sale_record.description,
      'netAmount', sale_record.net_amount,
      'saleDate', sale_record.sale_date,
      'status', sale_record.status
    )
  );

  return 'deleted';
end;
$$;

revoke all on function public.delete_sale_with_effects(uuid) from public;
grant execute on function public.delete_sale_with_effects(uuid) to authenticated;

commit;
