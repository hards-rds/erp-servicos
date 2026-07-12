import { PageHeader } from "@/components/layout/page-header";

export default function GeraisPage() {
  return (
    <>
      <PageHeader
        area="Configuracoes / Gerais"
        title="Configuracoes gerais"
        description="Parametros fiscais, financeiros, contas bancarias e preferencias do sistema."
      />
      <section className="form-panel">
        <h2>Empresa</h2>
        <form className="form-stack">
          <label>Nome da empresa<input placeholder="Empresa de Servicos Ltda" /></label>
          <label>CNPJ<input placeholder="00.000.000/0000-00" /></label>
          <label>Ambiente fiscal<select defaultValue="sandbox"><option value="sandbox">Sandbox/Homologacao</option><option value="production">Producao</option></select></label>
          <button className="primary-button" type="button">Salvar</button>
        </form>
      </section>
    </>
  );
}
