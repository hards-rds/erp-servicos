import { PageHeader } from "@/components/layout/page-header";
import { VehicleForm } from "@/components/transport/vehicle-form";
import { getTransportContext } from "@/lib/transport/server";
export default async function NewVehiclePage() { const context = await getTransportContext("frota", "criar"); return <><PageHeader area="Transporte / Frota / Novo" title="Novo veiculo" description="Cadastre identificacao, capacidade, propriedade e vencimentos." action={<a className="ghost-button button-link" href="/transporte/frota">Voltar para frota</a>} />{context.ok ? <section className="form-panel page-form-panel"><VehicleForm /></section> : <div className="form-error">Este cadastro nao esta disponivel para a empresa ativa.</div>}</>; }
