import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Circle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireCompanyPermission } from "@/lib/auth/api-access";
import {
  buildOnboardingSteps,
  onboardingProgress,
  type OnboardingSegment,
  type OnboardingSignals
} from "@/lib/onboarding/checklist";

const segmentLabels: Record<OnboardingSegment, string> = {
  tecnologia: "Tecnologia",
  otica: "Otica",
  escola_futebol: "Escola de futebol",
  transportadora: "Transportadora",
  generico: "Generico"
};

export default async function OnboardingPage() {
  const access = await requireCompanyPermission({
    module: "configuracoes.gerais",
    action: "visualizar"
  });
  if (!access.ok) redirect(access.reason === "unauthorized" ? "/login" : "/dashboard");

  const companyId = access.company.id;
  const [
    companyResult,
    groupsResult,
    membersResult,
    clientsResult,
    servicesResult,
    productsResult,
    contractsResult,
    entriesResult,
    athletesResult,
    classesResult,
    enrollmentsResult,
    vehiclesResult,
    driversResult,
    tripsResult,
    certificateResult,
    emailResult
  ] = await Promise.all([
    access.supabase.from("companies").select("name,document,service_segment,fiscal_settings").eq("id", companyId).maybeSingle(),
    access.supabase.from("groups").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
    access.supabase.from("company_members").select("user_id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
    access.supabase.from("clients").select("id", { count: "exact", head: true }).eq("company_id", companyId),
    access.supabase.from("service_catalog").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
    access.supabase.from("products").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
    access.supabase.from("contracts").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "encerrado"),
    access.supabase.from("financial_entries").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "cancelado"),
    access.supabase.from("school_athletes").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "ativo"),
    access.supabase.from("school_classes").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
    access.supabase.from("school_enrollments").select("id", { count: "exact", head: true }).eq("company_id", companyId).in("status", ["pendente", "ativa"]),
    access.supabase.from("transport_vehicles").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "inativo"),
    access.supabase.from("transport_drivers").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "ativo"),
    access.supabase.from("transport_trips").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "cancelada"),
    access.supabase.from("digital_certificates").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true),
    access.supabase.from("email_settings").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("active", true)
  ]);

  const company = companyResult.data;
  const segment = (["tecnologia", "otica", "escola_futebol", "transportadora", "generico"].includes(company?.service_segment || "")
    ? company?.service_segment
    : "generico") as OnboardingSegment;
  const fiscal = (company?.fiscal_settings || {}) as Record<string, unknown>;
  const signals: OnboardingSignals = {
    companyIdentity: Boolean(company?.name?.trim() && String(company?.document || "").replace(/\D/g, "").length >= 11),
    accessConfigured: (groupsResult.count || 0) > 0 && (membersResult.count || 0) > 0,
    clients: clientsResult.count || 0,
    services: servicesResult.count || 0,
    products: productsResult.count || 0,
    contracts: contractsResult.count || 0,
    financialEntries: entriesResult.count || 0,
    schoolAthletes: athletesResult.count || 0,
    schoolClasses: classesResult.count || 0,
    schoolEnrollments: enrollmentsResult.count || 0,
    transportVehicles: vehiclesResult.count || 0,
    transportDrivers: driversResult.count || 0,
    transportTrips: tripsResult.count || 0,
    fiscalConfigured: Boolean(fiscal.cityCode && (certificateResult.count || 0) > 0),
    emailConfigured: (emailResult.count || 0) > 0
  };
  const steps = buildOnboardingSteps(segment, signals);
  const progress = onboardingProgress(steps);
  const pending = steps.filter((step) => !step.optional && !step.complete).length;

  return (
    <>
      <PageHeader
        area="Configuracoes / Primeiros passos"
        title="Primeiros passos"
        description={`${company?.name || "Empresa"} - ${segmentLabels[segment]}`}
        action={<Link className="ghost-button button-link" href="/configuracoes/importacoes">Importar dados</Link>}
      />
      <section className="metrics onboarding-metrics">
        <MetricCard label="Progresso" value={`${progress.percent}%`} detail={`${progress.completed} de ${progress.total} etapas obrigatorias`} />
        <MetricCard label="Pendencias" value={String(pending)} detail={pending ? "itens obrigatorios" : "configuracao essencial concluida"} />
        <MetricCard label="Segmento" value={segmentLabels[segment]} detail="jornada ativa" />
      </section>
      <section className="table-panel onboarding-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Preparacao da operacao</h2>
            <p className="muted">O progresso reflete os dados atuais desta empresa.</p>
          </div>
          <StatusBadge tone={progress.percent === 100 ? "success" : "warning"}>
            {progress.percent === 100 ? "Pronto" : "Em configuracao"}
          </StatusBadge>
        </div>
        <div className="onboarding-progress" aria-label={`${progress.percent}% concluido`}>
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="onboarding-list">
          {steps.map((step) => (
            <article className={`onboarding-step${step.complete ? " complete" : ""}`} key={step.id}>
              <span className="onboarding-step-icon" aria-hidden="true">
                {step.complete ? <Check /> : <Circle />}
              </span>
              <div className="onboarding-step-copy">
                <div className="onboarding-step-title">
                  <strong>{step.title}</strong>
                  {step.optional ? <span className="muted">Opcional</span> : null}
                </div>
                <small className="muted">{step.detail}</small>
              </div>
              <Link className="ghost-button button-link compact-button" href={step.href}>{step.actionLabel}</Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
