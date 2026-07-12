import { PageHeader } from "@/components/layout/page-header";

export default function EmailsPage() {
  return (
    <>
      <PageHeader
        area="Configuracoes / E-mails"
        title="E-mails"
        description="Remetentes, templates, destinatarios padrao e historico de envio."
      />
      <section className="form-panel">
        <h2>Configuracao</h2>
        <form className="form-stack">
          <label>Remetente<input placeholder="financeiro@empresa.com" /></label>
          <label>Responder para<input placeholder="atendimento@empresa.com" /></label>
          <label>Template financeiro<textarea /></label>
          <button className="primary-button" type="button">Salvar</button>
        </form>
      </section>
    </>
  );
}
