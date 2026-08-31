import { ContractorForm } from "@/components/people/contractor-form";
import { PageHeader } from "@/components/layout/page-header";

export default async function NovoPrestadorPage({ searchParams }: { searchParams?: Promise<{ status?: string }> }) {
  const params = await searchParams;
  return (
    <>
      <PageHeader
        area="Pessoas / Prestadores PJ / Novo"
        title="Novo prestador PJ"
        description="Defina o CNPJ, a vigencia e a composicao da remuneracao mensal."
        action={<Link className="ghost-button button-link" href="/pessoas/colaboradores">Voltar para prestadores</Link>}
      />
      {params?.status === "invalid" ? <div className="form-error">Revise o CNPJ, a vigencia e os valores informados.</div> : null}
      <section className="form-panel page-form-panel">
        <ContractorForm action="create" submitLabel="Cadastrar prestador" />
      </section>
    </>
  );
}
import Link from "next/link";
