begin;

create or replace function public.import_products_with_initial_stock(
  target_company_id uuid,
  product_rows jsonb
)
returns table(id uuid, current_stock numeric, cost_price numeric)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.company_match(target_company_id)
    or not public.app_has_permission('operacao.estoque', 'criar') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with source_rows as (
    select *
    from jsonb_to_recordset(product_rows) as source(
      sku text,
      name text,
      category text,
      unit text,
      cost_price numeric,
      sale_price numeric,
      current_stock numeric,
      min_stock numeric,
      notes text,
      active boolean
    )
  ),
  inserted as (
    insert into public.products (
      company_id,
      sku,
      name,
      category,
      unit,
      cost_price,
      sale_price,
      current_stock,
      min_stock,
      notes,
      active,
      created_by,
      updated_by
    )
    select
      target_company_id,
      source.sku,
      source.name,
      source.category,
      coalesce(nullif(source.unit, ''), 'un'),
      source.cost_price,
      source.sale_price,
      source.current_stock,
      source.min_stock,
      source.notes,
      coalesce(source.active, true),
      auth.uid(),
      auth.uid()
    from source_rows source
    on conflict (company_id, sku) do nothing
    returning products.id, products.current_stock, products.cost_price
  ),
  movements as (
    insert into public.stock_movements (
      company_id,
      product_id,
      movement_date,
      type,
      quantity,
      unit_cost,
      reason,
      created_by
    )
    select
      target_company_id,
      inserted.id,
      current_date,
      'entrada',
      inserted.current_stock,
      inserted.cost_price,
      'Estoque inicial importado',
      auth.uid()
    from inserted
    where inserted.current_stock > 0
    returning product_id
  )
  select inserted.id, inserted.current_stock, inserted.cost_price
  from inserted;
end;
$$;

revoke all on function public.import_products_with_initial_stock(uuid, jsonb) from public;
grant execute on function public.import_products_with_initial_stock(uuid, jsonb) to authenticated;

commit;
