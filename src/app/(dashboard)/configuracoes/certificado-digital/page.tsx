import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";

export default function CertificadoDigitalPage() {
  return (
    <>
      <PageHeader
        area="Configuracoes / Certificado Digital"
        title="Certificado digital"
        description="Cadastro seguro de certificado A1/PFX, validade e uso restrito no servidor."
      />
      <section className="form-panel">
        <h2>Certificado atual</h2>
        <p><StatusBadge tone="warning">nao configurado</StatusBadge></p>
        <form className="form-stack">
          <label>Arquivo PFX<input type="file" accept=".pfx,.p12" /></label>
          <label>Senha<input type="password" /></label>
          <button className="primary-button" type="button">Validar em sandbox</button>
        </form>
      </section>
    </>
  );
}
