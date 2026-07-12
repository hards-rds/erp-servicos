import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";

export default function FluxoDeCaixaPage() {
  return (
    <>
      <PageHeader
        area="Financeiro / Fluxo de Caixa"
        title="Fluxo de caixa"
        description="Visao por competencia, vencimento e caixa."
      />
      <section className="metrics">
        <MetricCard label="Entradas previstas" value="R$ 128.450,00" />
        <MetricCard label="Entradas recebidas" value="R$ 84.210,00" />
        <MetricCard label="Saidas previstas" value="R$ 37.900,00" />
        <MetricCard label="Saldo projetado" value="R$ 90.550,00" />
      </section>
    </>
  );
}
