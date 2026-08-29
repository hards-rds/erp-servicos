import "server-only";

import { capacityAvailable, planDefinition, type PlanFeature, type PlanResource } from "@/domains/billing/saas-plans";
import { createServiceClient } from "@/lib/supabase/server";

export type TenantUsage = Record<PlanResource, number>;

export async function getTenantUsage(tenantId: string): Promise<TenantUsage> {
  const service = createServiceClient();
  const resources: PlanResource[] = ["companies", "users", "clients", "catalog_items", "recurrences"];
  const values = await Promise.all(resources.map(async (resource) => {
    const { data, error } = await service.rpc("app_tenant_resource_usage", {
      target_tenant_id: tenantId,
      resource_name: resource
    });
    if (error) throw new Error(`Nao foi possivel calcular o uso de ${resource}.`);
    return [resource, Number(data || 0)] as const;
  }));
  return Object.fromEntries(values) as TenantUsage;
}

export async function getTenantPlan(tenantId: string) {
  const service = createServiceClient();
  const [{ data: tenant, error: tenantError }, { data: subscription }] = await Promise.all([
    service.from("tenants").select("id,name,plan,status").eq("id", tenantId).maybeSingle(),
    service.from("tenant_subscriptions")
      .select("tenant_id,plan_code,status,billing_cycle,amount,currency,trial_ends_at,current_period_starts_at,current_period_ends_at,cancel_at_period_end")
      .eq("tenant_id", tenantId)
      .maybeSingle()
  ]);
  if (tenantError || !tenant) throw new Error("Tenant nao encontrado.");
  return { tenant, subscription, definition: planDefinition(subscription?.plan_code || tenant.plan) };
}

export async function canCreateTenantResource(tenantId: string, resource: PlanResource) {
  const [{ definition }, usage] = await Promise.all([getTenantPlan(tenantId), getTenantUsage(tenantId)]);
  const limit = definition.limits[resource];
  return { allowed: capacityAvailable(usage[resource], limit), usage: usage[resource], limit, plan: definition };
}

export async function tenantHasFeature(tenantId: string, feature: PlanFeature) {
  const { definition } = await getTenantPlan(tenantId);
  return definition.features[feature];
}
