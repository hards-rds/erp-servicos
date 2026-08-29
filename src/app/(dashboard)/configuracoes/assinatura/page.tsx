import { redirect } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  PLAN_DEFINITIONS,
  PLAN_FEATURE_LABELS,
  PLAN_RESOURCE_LABELS,
  usagePercentage,
  type PlanCode,
  type PlanFeature,
  type PlanResource
} from "@/domains/billing/saas-plans";
import { requireCompanyPermission } from "@/lib/auth/api-access";
import { getTenantPlan, getTenantUsage } from "@/server/services/saas-plan-service";

const resourceOrder: PlanResource[] = ["companies", "users", "clients", "catalog_items", "recurrences"];
const featureOrder: PlanFeature[] = ["nfse", "reports", "imports", "recurring_automation", "api_integrations", "multi_company"];
const planOrder: PlanCode[] = ["starter", "pro", "enterprise"];

const subscriptionLabels: Record<string, string> = {
  trialing: "Em teste",
  active: "Ativa",
  past_due: "Pagamento pendente",
  suspended: "Suspensa",
  cancelled: "Cancelada"
};

function formatLimit(limit: number | null) {
  return limit === null ? "Sem limite" : new Intl.NumberFormat("pt-BR").format(limit);
}

function formatMoney(value: number | null | undefined, currency = "BRL") {
  if (value === null || value === undefined) return "Definido comercialmente";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Nao definida";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value;
  return new Intl.DateTimeFormat("pt-BR").format(new Date(normalized));
}

export default async function SubscriptionPage() {
  const access = await requireCompanyPermission({ module: "configuracoes.gerais", action: "visualizar" });
  if (!access.ok) redirect(access.reason === "unauthorized" ? "/login" : "/dashboard");

  const [{ tenant, subscription, definition }, usage, invoicesResult] = await Promise.all([
    getTenantPlan(access.profile.tenant_id),
    getTenantUsage(access.profile.tenant_id),
    access.supabase.from("saas_invoices")
      .select("id,reference,description,amount,currency,due_date,paid_at,status,external_url")
      .eq("tenant_id", access.profile.tenant_id)
      .order("due_date", { ascending: false })
      .limit(12)
  ]);
  const invoices = invoicesResult.data || [];
  const subscriptionStatus = subscription?.status || (tenant.status === "trial" ? "trialing" : tenant.status);

  return (
    <>
      <PageHeader
        area="Configuracoes / Assinatura"
        title="Assinatura e plano"
        description={`Uso e recursos contratados por ${tenant.name}.`}
      />

      <section className="subscription-summary">
        <article className="form-panel subscription-current-plan">
          <div className="panel-heading-row">
            <div>
              <span className="muted">Plano atual</span>
              <h2>{definition.name}</h2>
            </div>
            <StatusBadge tone={subscriptionStatus === "active" ? "success" : "warning"}>
              {subscriptionLabels[subscriptionStatus] || subscriptionStatus}
            </StatusBadge>
          </div>
          <p className="muted">{definition.description}</p>
          <dl className="subscription-details">
            <div><dt>Ciclo</dt><dd>{subscription?.billing_cycle === "annual" ? "Anual" : subscription?.billing_cycle === "manual" ? "Manual" : "Mensal"}</dd></div>
            <div><dt>Valor</dt><dd>{formatMoney(subscription?.amount, subscription?.currency)}</dd></div>
            <div><dt>Proxima renovacao</dt><dd>{formatDate(subscription?.current_period_ends_at)}</dd></div>
          </dl>
        </article>

        <section className="table-panel subscription-usage-panel">
          <div className="table-panel-heading"><div><h2>Uso do plano</h2><p className="muted">Contagem consolidada de todas as empresas do tenant.</p></div></div>
          <div className="plan-usage-list">
            {resourceOrder.map((resource) => {
              const limit = definition.limits[resource];
              const percent = usagePercentage(usage[resource], limit);
              const nearLimit = limit !== null && percent >= 80;
              return (
                <div className="plan-usage-row" key={resource}>
                  <div><strong>{PLAN_RESOURCE_LABELS[resource]}</strong><span className="muted">{usage[resource].toLocaleString("pt-BR")} de {formatLimit(limit)}</span></div>
                  <div className={`plan-usage-track${nearLimit ? " warning" : ""}`} aria-label={`${percent}% utilizado`}><span style={{ width: `${limit === null ? 0 : percent}%` }} /></div>
                </div>
              );
            })}
          </div>
        </section>
      </section>

      <section className="plan-comparison" aria-label="Comparacao dos planos">
        {planOrder.map((code) => {
          const plan = PLAN_DEFINITIONS[code];
          return (
            <article className={`form-panel plan-option${definition.code === code ? " active" : ""}`} key={code}>
              <div className="panel-heading-row"><h2>{plan.name}</h2>{definition.code === code ? <StatusBadge tone="success">Atual</StatusBadge> : null}</div>
              <p className="muted">{plan.description}</p>
              <ul className="plan-feature-list">
                {featureOrder.map((feature) => (
                  <li key={feature} className={plan.features[feature] ? "enabled" : "disabled"}>
                    {plan.features[feature] ? <Check aria-hidden="true" /> : <Minus aria-hidden="true" />}
                    <span>{PLAN_FEATURE_LABELS[feature]}</span>
                  </li>
                ))}
              </ul>
              <div className="plan-limit-summary">{resourceOrder.map((resource) => <span key={resource}><strong>{formatLimit(plan.limits[resource])}</strong> {PLAN_RESOURCE_LABELS[resource].toLowerCase()}</span>)}</div>
            </article>
          );
        })}
      </section>

      <section className="table-panel">
        <div className="table-panel-heading"><div><h2>Faturas da plataforma</h2><p className="muted">Estas faturas nao entram no financeiro operacional das empresas.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Referencia</th><th>Descricao</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Documento</th></tr></thead><tbody>
          {invoices.length ? invoices.map((invoice) => <tr key={invoice.id}><td>{invoice.reference}</td><td>{invoice.description || "Assinatura da plataforma"}</td><td>{formatDate(invoice.due_date)}</td><td>{formatMoney(Number(invoice.amount), invoice.currency)}</td><td><StatusBadge tone={invoice.status === "paid" ? "success" : invoice.status === "cancelled" ? "neutral" : "warning"}>{invoice.status}</StatusBadge></td><td>{invoice.external_url ? <a className="ghost-button compact-button button-link" href={invoice.external_url} target="_blank" rel="noreferrer">Abrir</a> : "-"}</td></tr>) : <tr><td colSpan={6}>Nenhuma fatura registrada.</td></tr>}
        </tbody></table></div>
      </section>
    </>
  );
}
