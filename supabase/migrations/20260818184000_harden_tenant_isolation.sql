begin;

-- Operational access always follows the company selected in the user's profile.
-- Global system administration is handled by validated server routes using service_role.
create or replace function public.company_match(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_company_id = public.app_current_company_id()
$$;

create or replace function public.app_can_admin_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.tenant_match(target_tenant_id)
    and (
      public.app_is_master()
      or exists (
        select 1
        from public.tenant_members tm
        where tm.user_id = auth.uid()
          and tm.tenant_id = target_tenant_id
          and tm.active = true
          and tm.role in ('owner', 'system_admin')
      )
    )
$$;

create or replace function public.app_can_admin_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.company_match(target_company_id)
    and (
      public.app_is_master()
      or exists (
        select 1
        from public.company_members cm
        where cm.user_id = auth.uid()
          and cm.company_id = target_company_id
          and cm.active = true
          and cm.role = 'owner'
      )
    )
$$;

drop policy if exists tenant_members_visible on public.tenant_members;
create policy tenant_members_visible on public.tenant_members
for select to authenticated
using (public.tenant_match(tenant_id));

drop policy if exists company_members_visible on public.company_members;
create policy company_members_visible on public.company_members
for select to authenticated
using (public.company_match(company_id));

drop policy if exists companies_same_tenant_select on public.companies;
create policy companies_same_tenant_select on public.companies
for select to authenticated
using (public.tenant_match(tenant_id));

drop policy if exists profiles_same_tenant_select on public.profiles;
create policy profiles_same_tenant_select on public.profiles
for select to authenticated
using (id = auth.uid() or public.tenant_match(tenant_id));

drop policy if exists profiles_tenant_admin_write on public.profiles;
create policy profiles_tenant_admin_write on public.profiles
for all to authenticated
using (public.app_can_admin_tenant(tenant_id))
with check (public.app_can_admin_tenant(tenant_id));

drop policy if exists groups_same_tenant_select on public.groups;
create policy groups_same_tenant_select on public.groups
for select to authenticated
using (public.company_match(company_id));

drop policy if exists group_permissions_same_tenant_select on public.group_permissions;
create policy group_permissions_same_tenant_select on public.group_permissions
for select to authenticated
using (
  exists (
    select 1 from public.groups g
    where g.id = group_permissions.group_id
      and public.company_match(g.company_id)
  )
);

drop policy if exists group_permissions_company_admin_write on public.group_permissions;
create policy group_permissions_company_admin_write on public.group_permissions
for all to authenticated
using (
  exists (
    select 1 from public.groups g
    where g.id = group_permissions.group_id
      and public.app_can_admin_company(g.company_id)
  )
)
with check (
  exists (
    select 1 from public.groups g
    where g.id = group_permissions.group_id
      and public.app_can_admin_company(g.company_id)
  )
);

drop policy if exists user_groups_same_tenant_select on public.user_groups;
create policy user_groups_same_tenant_select on public.user_groups
for select to authenticated
using (
  user_id = auth.uid()
  or (
    exists (
      select 1 from public.profiles p
      where p.id = user_groups.user_id
        and public.tenant_match(p.tenant_id)
    )
    and exists (
      select 1 from public.groups g
      where g.id = user_groups.group_id
        and public.company_match(g.company_id)
    )
  )
);

drop policy if exists user_groups_tenant_admin_write on public.user_groups;
create policy user_groups_tenant_admin_write on public.user_groups
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = user_groups.user_id
      and public.app_can_admin_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.groups g
    where g.id = user_groups.group_id
      and public.app_can_admin_company(g.company_id)
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = user_groups.user_id
      and public.app_can_admin_tenant(p.tenant_id)
  )
  and exists (
    select 1 from public.groups g
    where g.id = user_groups.group_id
      and public.app_can_admin_company(g.company_id)
  )
);

drop policy if exists clients_same_company_all on public.clients;
create policy clients_same_company_all on public.clients
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists client_contacts_same_company_all on public.client_contacts;
create policy client_contacts_same_company_all on public.client_contacts
for all to authenticated
using (public.client_company_match(client_id))
with check (public.client_company_match(client_id));

drop policy if exists contracts_same_company_all on public.contracts;
create policy contracts_same_company_all on public.contracts
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists contract_adjustments_same_company_all on public.contract_adjustments;
create policy contract_adjustments_same_company_all on public.contract_adjustments
for all to authenticated
using (public.contract_company_match(contract_id))
with check (public.contract_company_match(contract_id));

drop policy if exists financial_entries_same_company_all on public.financial_entries;
create policy financial_entries_same_company_all on public.financial_entries
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists payables_same_company_all on public.payables;
create policy payables_same_company_all on public.payables
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists bank_accounts_same_company_all on public.bank_accounts;
create policy bank_accounts_same_company_all on public.bank_accounts
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists bank_transactions_same_company_all on public.bank_transactions;
create policy bank_transactions_same_company_all on public.bank_transactions
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists bank_reconciliations_same_company_all on public.bank_reconciliations;
create policy bank_reconciliations_same_company_all on public.bank_reconciliations
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists nfse_documents_same_company_all on public.nfse_documents;
create policy nfse_documents_same_company_all on public.nfse_documents
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists nfse_events_same_company_all on public.nfse_events;
create policy nfse_events_same_company_all on public.nfse_events
for all to authenticated
using (public.nfse_company_match(nfse_document_id))
with check (public.nfse_company_match(nfse_document_id));

drop policy if exists boleto_charges_same_company_all on public.boleto_charges;
create policy boleto_charges_same_company_all on public.boleto_charges
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists api_credentials_company_admin_all on public.api_credentials;
create policy api_credentials_company_admin_all on public.api_credentials
for all to authenticated
using (public.app_can_admin_company(company_id))
with check (public.app_can_admin_company(company_id));

drop policy if exists digital_certificates_company_admin_all on public.digital_certificates;
create policy digital_certificates_company_admin_all on public.digital_certificates
for all to authenticated
using (public.app_can_admin_company(company_id))
with check (public.app_can_admin_company(company_id));

drop policy if exists email_settings_company_admin_all on public.email_settings;
create policy email_settings_company_admin_all on public.email_settings
for all to authenticated
using (public.app_can_admin_company(company_id))
with check (public.app_can_admin_company(company_id));

drop policy if exists email_logs_same_company_select on public.email_logs;
create policy email_logs_same_company_select on public.email_logs
for select to authenticated
using (public.company_match(company_id));

drop policy if exists files_same_company_all on public.files;
create policy files_same_company_all on public.files
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists audit_logs_same_company_select on public.audit_logs;
create policy audit_logs_same_company_select on public.audit_logs
for select to authenticated
using (public.company_match(company_id));

drop policy if exists service_records_same_company_all on public.service_records;
create policy service_records_same_company_all on public.service_records
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists client_optical_records_same_company_select on public.client_optical_records;
drop policy if exists client_optical_records_same_company_insert on public.client_optical_records;
drop policy if exists client_optical_records_same_company_all on public.client_optical_records;
create policy client_optical_records_same_company_all on public.client_optical_records
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists products_same_company_all on public.products;
create policy products_same_company_all on public.products
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists sales_same_company_all on public.sales;
create policy sales_same_company_all on public.sales
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists sale_items_same_company_all on public.sale_items;
create policy sale_items_same_company_all on public.sale_items
for all to authenticated
using (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and public.company_match(s.company_id)
  )
)
with check (
  exists (
    select 1 from public.sales s
    where s.id = sale_items.sale_id
      and public.company_match(s.company_id)
  )
);

drop policy if exists stock_movements_same_company_all on public.stock_movements;
create policy stock_movements_same_company_all on public.stock_movements
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists commission_sellers_same_company_all on public.commission_sellers;
create policy commission_sellers_same_company_all on public.commission_sellers
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

drop policy if exists seller_commission_rules_same_company_all on public.seller_commission_rules;
create policy seller_commission_rules_same_company_all on public.seller_commission_rules
for all to authenticated
using (public.company_match(company_id))
with check (
  public.company_match(company_id)
  and exists (
    select 1 from public.commission_sellers sellers
    where sellers.id = seller_commission_rules.commission_seller_id
      and sellers.company_id = seller_commission_rules.company_id
  )
);

drop policy if exists commissions_same_company_all on public.commissions;
create policy commissions_same_company_all on public.commissions
for all to authenticated
using (public.company_match(company_id))
with check (
  public.company_match(company_id)
  and exists (
    select 1 from public.commission_sellers sellers
    where sellers.id = commissions.commission_seller_id
      and sellers.company_id = commissions.company_id
  )
);

drop policy if exists service_catalog_same_company_all on public.service_catalog;
create policy service_catalog_same_company_all on public.service_catalog
for all to authenticated
using (public.company_match(company_id))
with check (public.company_match(company_id));

commit;
