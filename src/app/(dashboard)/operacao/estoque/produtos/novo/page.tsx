import { ProductForm } from "@/components/inventory/inventory-forms";
import { PageHeader } from "@/components/layout/page-header";

export default function NovoProdutoPage() {
  return (
    <>
      <PageHeader area="Operacao / Estoque / Produtos / Novo" title="Novo produto" description="Cadastre precos, unidade e saldo inicial." action={<a className="ghost-button button-link" href="/operacao/estoque">Voltar para estoque</a>} />
      <section className="form-panel page-form-panel"><ProductForm /></section>
    </>
  );
}
