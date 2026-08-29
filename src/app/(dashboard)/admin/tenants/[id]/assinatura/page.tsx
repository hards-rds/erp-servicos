import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { PLAN_DEFINITIONS, PLAN_RESOURCE_LABELS, type PlanCode, type PlanResource } from "@/domains/billing/saas-plans";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { getTenantUsage } from "@/server/services/saas-plan-service";

const resources: PlanResource[] = ["companies", "users", "clients", "catalog_items", "recurrences"];

function dateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

export default async function TenantSubscriptionAdminPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ status?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("role,active").eq("id", user.id).maybeSingle() : { data: null };
  if (profile?.role !== "system_admin" || profile.active === false) notFound();

  const service = createServiceClient();
  const [{ data: tenant }, { data: subscription }, { data: invoices }, usage] = await Promise.all([
    service.from("tenants").select("id,name,slug,plan,status,companies(id,name)").eq("id", id).maybeSingle(),
    service.from("tenant_subscriptions").select("*").eq("tenant_id", id).maybeSingle(),
    service.from("saas_invoices").select("*").eq("tenant_id", id).order("due_date", { ascending: false }),
    getTenantUsage(id)
  ]);
  if (!tenant) notFound();
  const definition = PLAN_DEFINITIONS[(tenant.plan in PLAN_DEFINITIONS ? tenant.plan : "starter") as PlanCode];
  const message = query?.status === "saved" ? { success: true, text: "Assinatura atualizada." }
    : query?.status === "invoice_created" ? { success: true, text: "Fatura registrada." }
      : query?.status === "invoice_updated" ? { success: true, text: "Status da fatura atualizado." }
        : query?.status ? { success: false, text: "Nao foi possivel concluir a alteracao." } : null;

  return <>
    <PageHeader area="Admin / Tenants / Assinatura" title={tenant.name} description={`Plano, ciclo, cobranca e consumo do tenant ${tenant.slug}.`} action={<a className="ghost-button button-link" href="/admin/tenants">Voltar para tenants</a>} />
    {message ? <div className={message.success ? "form-success" : "form-error"}>{message.text}</div> : null}
    <section className="metrics subscription-admin-metrics">
      {resources.map((resource) => <article className="card" key={resource}><span className="muted">{PLAN_RESOURCE_LABELS[resource]}</span><strong>{usage[resource].toLocaleString("pt-BR")}</strong><small className="muted">limite {definition.limits[resource] === null ? "ilimitado" : definition.limits[resource]?.toLocaleString("pt-BR")}</small></article>)}
    </section>
    <section className="form-panel page-form-panel">
      <h2>Configuracao da assinatura</h2>
      <form className="form-stack" action="/api/admin/tenants/assinatura" method="post">
        <input type="hidden" name="action" value="update_subscription" /><input type="hidden" name="tenantId" value={tenant.id} />
        <div className="form-grid">
          <label>Plano<select name="planCode" defaultValue={subscription?.plan_code || tenant.plan}>{Object.values(PLAN_DEFINITIONS).map((plan) => <option key={plan.code} value={plan.code}>{plan.name}</option>)}</select></label>
          <label>Status<select name="subscriptionStatus" defaultValue={subscription?.status || "active"}><option value="trialing">Em teste</option><option value="active">Ativa</option><option value="past_due">Pagamento pendente</option><option value="suspended">Suspensa</option><option value="cancelled">Cancelada</option></select></label>
          <label>Ciclo<select name="billingCycle" defaultValue={subscription?.billing_cycle || "monthly"}><option value="monthly">Mensal</option><option value="annual">Anual</option><option value="manual">Manual</option></select></label>
          <label>Valor contratado<input name="amount" inputMode="decimal" defaultValue={subscription?.amount ?? ""} placeholder="0,00" /></label>
          <label>Fim do teste<input name="trialEndsAt" type="date" defaultValue={dateInput(subscription?.trial_ends_at)} /></label>
          <label>Inicio do periodo<input name="periodStartsAt" type="date" defaultValue={dateInput(subscription?.current_period_starts_at)} /></label>
          <label>Fim do periodo<input name="periodEndsAt" type="date" defaultValue={dateInput(subscription?.current_period_ends_at)} /></label>
        </div>
        <label className="checkbox-row"><input name="cancelAtPeriodEnd" type="checkbox" defaultChecked={subscription?.cancel_at_period_end || false} /><span>Cancelar ao final do periodo</span></label>
        <div className="page-form-actions"><button className="primary-button" type="submit">Salvar assinatura</button></div>
      </form>
    </section>
    <section className="form-panel page-form-panel">
      <h2>Nova fatura SaaS</h2>
      <form className="form-stack" action="/api/admin/tenants/assinatura" method="post">
        <input type="hidden" name="action" value="create_invoice" /><input type="hidden" name="tenantId" value={tenant.id} />
        <div className="form-grid"><label>Referencia<input name="reference" placeholder="2026-08" required /></label><label>Descricao<input name="description" placeholder="Assinatura da plataforma" /></label><label>Valor<input name="amount" inputMode="decimal" required /></label><label>Vencimento<input name="dueDate" type="date" required /></label><label>Link externo<input name="externalUrl" type="url" placeholder="https://" /></label></div>
        <div className="page-form-actions"><button className="primary-button" type="submit">Registrar fatura</button></div>
      </form>
    </section>
    <section className="table-panel"><h2>Faturas registradas</h2><div className="table-wrap"><table><thead><tr><th>Referencia</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Acoes</th></tr></thead><tbody>
      {(invoices || []).length ? (invoices || []).map((invoice) => <tr key={invoice.id}><td>{invoice.reference}</td><td>{new Intl.DateTimeFormat("pt-BR").format(new Date(`${invoice.due_date}T12:00:00`))}</td><td>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: invoice.currency }).format(Number(invoice.amount))}</td><td><StatusBadge tone={invoice.status === "paid" ? "success" : invoice.status === "cancelled" ? "neutral" : "warning"}>{invoice.status}</StatusBadge></td><td><form className="inline-actions" action="/api/admin/tenants/assinatura" method="post"><input type="hidden" name="action" value="update_invoice" /><input type="hidden" name="tenantId" value={tenant.id} /><input type="hidden" name="invoiceId" value={invoice.id} /><button className="ghost-button compact-button" name="invoiceStatus" value="paid" type="submit" disabled={invoice.status === "paid"}>Marcar paga</button><button className="ghost-button compact-button" name="invoiceStatus" value="cancelled" type="submit" disabled={invoice.status === "cancelled"}>Cancelar</button></form></td></tr>) : <tr><td colSpan={5}>Nenhuma fatura registrada.</td></tr>}
    </tbody></table></div></section>
  </>;
}
