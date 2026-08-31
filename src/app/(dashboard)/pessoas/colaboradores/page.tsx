import { ContractorActions } from "@/components/people/contractor-actions";
import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { contractorCommissionBasisLabel } from "@/domains/people/contractor-compensation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContractorRow = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  tax_id: string;
  role_title: string;
  fixed_monthly_amount: number | string;
  cost_allowance_amount: number | string;
  commission_rate: number | string;
  commission_basis: string;
  due_day: number;
  active: boolean;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Prestador PJ cadastrado com sucesso." },
  updated: { kind: "success", text: "Prestador PJ atualizado com sucesso." },
  invalid: { kind: "error", text: "Revise o CNPJ, a vigencia e os valores informados." },
  forbidden: { kind: "error", text: "Seu usuario nao possui permissao para esta operacao." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  error: { kind: "error", text: "Nao foi possivel salvar o prestador. Verifique se o CNPJ ja esta cadastrado." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCnpj(value: string) {
  return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

export default async function ColaboradoresPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data } = profile?.company_id
    ? await supabase.from("contractors")
      .select("id,legal_name,trade_name,tax_id,role_title,fixed_monthly_amount,cost_allowance_amount,commission_rate,commission_basis,due_day,active")
      .eq("company_id", profile.company_id)
      .order("legal_name")
    : { data: [] };
  const contractors = (data || []) as ContractorRow[];
  const active = contractors.filter((item) => item.active);
  const fixedTotal = active.reduce((sum, item) => sum + Number(item.fixed_monthly_amount), 0);
  const allowanceTotal = active.reduce((sum, item) => sum + Number(item.cost_allowance_amount), 0);
  const message = params?.status ? messages[params.status] : !profile?.company_id ? messages.profile_error : null;

  return (
    <>
      <PageHeader
        area="Pessoas / Prestadores PJ"
        title="Prestadores PJ"
        description="Cadastre empresas prestadoras e defina fixo, ajuda de custo e comissao mensal."
        action={(
          <>
            <Link className="ghost-button button-link" href="/pessoas/fechamentos">Fechamentos</Link>
            <Link className="primary-button button-link" href="/pessoas/colaboradores/novo">Novo prestador</Link>
          </>
        )}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="metrics">
        <MetricCard label="Prestadores ativos" value={String(active.length)} detail={`${contractors.length} cadastrados`} />
        <MetricCard label="Fixos mensais" value={formatMoney(fixedTotal)} detail="Antes das comissoes" />
        <MetricCard label="Ajudas de custo" value={formatMoney(allowanceTotal)} detail="Previsao mensal" />
        <MetricCard label="Base fixa mensal" value={formatMoney(fixedTotal + allowanceTotal)} detail="Sem comissao variavel" />
      </section>
      <section className="table-panel">
        <div className="table-panel-heading">
          <div><h2>Prestadores cadastrados</h2><span className="list-count">Todos com contratacao PJ</span></div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th data-sort-default="ascending">Prestador</th><th>CNPJ</th><th>Funcao</th><th>Fixo</th><th>Ajuda</th><th>Comissao</th><th>Pagamento</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {contractors.length ? contractors.map((contractor) => {
                const name = contractor.trade_name || contractor.legal_name;
                return (
                  <tr key={contractor.id}>
                    <td><strong>{name}</strong>{contractor.trade_name ? <small className="table-secondary">{contractor.legal_name}</small> : null}</td>
                    <td>{formatCnpj(contractor.tax_id)}</td>
                    <td>{contractor.role_title}</td>
                    <td>{formatMoney(contractor.fixed_monthly_amount)}</td>
                    <td>{formatMoney(contractor.cost_allowance_amount)}</td>
                    <td>{Number(contractor.commission_rate).toLocaleString("pt-BR", { maximumFractionDigits: 4 })}%<small className="table-secondary">{contractorCommissionBasisLabel(contractor.commission_basis)}</small></td>
                    <td>Dia {contractor.due_day}</td>
                    <td><StatusBadge tone={contractor.active ? "success" : "neutral"}>{contractor.active ? "ativo" : "inativo"}</StatusBadge></td>
                    <td><ContractorActions id={contractor.id} name={name} /></td>
                  </tr>
                );
              }) : <tr><td colSpan={9}>Nenhum prestador PJ cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
import Link from "next/link";
