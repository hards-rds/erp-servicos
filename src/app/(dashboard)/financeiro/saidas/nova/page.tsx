import { CreatePayableForm } from "@/components/finance/create-payable-form";
import { PageHeader } from "@/components/layout/page-header";

export default function NovaSaidaPage() {
  return <><PageHeader area="Financeiro / Saidas / Nova" title="Nova conta a pagar" description="Registre despesas avulsas, compras parceladas ou compromissos fixos mensais." action={<a className="ghost-button button-link" href="/financeiro/saidas">Voltar para saidas</a>} /><section className="form-panel page-form-panel"><CreatePayableForm /></section></>;
}
