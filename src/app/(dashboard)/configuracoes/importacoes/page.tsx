import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StandardImportCenter } from "@/components/settings/standard-import-center";
import type { ServiceSegment } from "@/domains/services/catalog";
import { requireCompanyPermission } from "@/lib/auth/api-access";
import { standardImportDefinitions, type StandardImportKind } from "@/lib/import/standard-import";

export default async function ImportacoesPage() {
  const access = await requireCompanyPermission({ module: "configuracoes.gerais", action: "configurar" });
  if (!access.ok) redirect(access.reason === "unauthorized" ? "/login" : "/dashboard");
  const { data: company } = await access.supabase
    .from("companies")
    .select("name,service_segment")
    .eq("id", access.company.id)
    .maybeSingle();
  const segment = (company?.service_segment || "generico") as ServiceSegment;
  const options = (Object.entries(standardImportDefinitions) as Array<[StandardImportKind, typeof standardImportDefinitions[StandardImportKind]]>)
    .filter(([, definition]) => definition.segments.includes(segment))
    .map(([kind, definition]) => ({ kind, label: definition.label, description: definition.description }));

  return (
    <>
      <PageHeader
        area="Configuracoes / Importacoes"
        title="Importar dados"
        description={`${company?.name || "Empresa"} - modelos oficiais com validacao antes da gravacao.`}
        action={<a className="ghost-button button-link" href="/configuracoes/onboarding">Voltar para primeiros passos</a>}
      />
      <section className="form-panel page-form-panel">
        <StandardImportCenter options={options} />
      </section>
      {segment === "otica" ? (
        <section className="table-panel import-specialized-panel">
          <div>
            <h2>Pacientes e receitas opticas</h2>
            <p className="muted">Importacao conjunta com ligacao por CPF/CNPJ ou nome unico.</p>
          </div>
          <a className="ghost-button button-link" href={`/admin/importacao-optica?companyId=${access.company.id}`}>Abrir importador clinico</a>
        </section>
      ) : null}
    </>
  );
}
