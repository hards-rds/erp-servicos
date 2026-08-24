import { PageHeader } from "@/components/layout/page-header";
import { ClientForm } from "../client-form";

export default function NovoClientePage() {
  return (
    <>
      <PageHeader
        area="Cadastros / Clientes / Novo"
        title="Novo cliente"
        description="Informe os dados cadastrais, fiscais e de contato."
        action={<a className="ghost-button button-link" href="/cadastros/clientes">Voltar para clientes</a>}
      />
      <section className="form-panel page-form-panel"><ClientForm /></section>
    </>
  );
}
