import { PageHeader } from "@/components/layout/page-header";
import { MetricCard } from "@/components/ui/metric-card";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { getTransportContext } from "@/lib/transport/server";

type PageProps = { searchParams?: Promise<{ status?: string }> };
const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Veiculo cadastrado." }, updated: { kind: "success", text: "Veiculo atualizado." }, deleted: { kind: "success", text: "Veiculo excluido." },
  duplicate: { kind: "error", text: "Esta placa ja esta cadastrada." }, linked: { kind: "error", text: "O veiculo possui viagens e nao pode ser excluido." }, invalid: { kind: "error", text: "Revise os dados do veiculo." },
  wrong_segment: { kind: "error", text: "Este modulo esta disponivel apenas para transportadoras." }, forbidden: { kind: "error", text: "Seu usuario nao possui permissao para esta acao." }, error: { kind: "error", text: "Nao foi possivel concluir a operacao." }
};
type Vehicle = { id: string; plate: string; make: string | null; model: string | null; vehicle_kind: string; body_type: string | null; capacity_kg: number | string | null; licensing_expires_at: string | null; status: string };
function date(value: string | null) { return value ? new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR") : "-"; }

export default async function FleetPage({ searchParams }: PageProps) {
  const query = await searchParams; const context = await getTransportContext("frota");
  const { data } = context.ok ? await context.supabase.from("transport_vehicles").select("id,plate,make,model,vehicle_kind,body_type,capacity_kg,licensing_expires_at,status").eq("company_id", context.profile.company_id).order("plate") : { data: [] };
  const vehicles = (data || []) as Vehicle[]; const message = query?.status ? messages[query.status] : null;
  return <><PageHeader area="Transporte / Frota" title="Frota" description="Veiculos de tracao, reboques, capacidade e vencimentos operacionais." action={<a className="primary-button button-link" href="/transporte/frota/novo">Novo veiculo</a>} />
    {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
    <section className="metrics"><MetricCard label="Veiculos" value={String(vehicles.length)} detail="cadastrados" /><MetricCard label="Disponiveis" value={String(vehicles.filter((item) => item.status === "ativo").length)} detail="ativos" /><MetricCard label="Em manutencao" value={String(vehicles.filter((item) => item.status === "manutencao").length)} detail="indisponiveis" /></section>
    <section className="table-panel"><h2>Veiculos cadastrados</h2><div className="table-wrap"><table><thead><tr><th>Placa</th><th>Veiculo</th><th>Tipo</th><th>Capacidade</th><th>Licenciamento</th><th>Status</th><th>Acoes</th></tr></thead><tbody>
      {vehicles.length ? vehicles.map((item) => <tr key={item.id}><td><strong>{item.plate}</strong></td><td>{[item.make, item.model].filter(Boolean).join(" ") || "Nao informado"}<div className="muted">{item.body_type || "Sem carroceria"}</div></td><td>{item.vehicle_kind}</td><td>{item.capacity_kg ? `${Number(item.capacity_kg).toLocaleString("pt-BR")} kg` : "-"}</td><td>{date(item.licensing_expires_at)}</td><td><span className={`badge ${item.status === "ativo" ? "success" : item.status === "manutencao" ? "warning" : "neutral"}`}>{item.status}</span></td><td><RowActionsMenu label={`Acoes do veiculo ${item.plate}`}><a className="ghost-button button-link compact-button" href={`/transporte/frota/${item.id}/editar`}>Editar</a><form action="/api/transporte/frota" method="post"><input type="hidden" name="action" value="delete" /><input type="hidden" name="vehicleId" value={item.id} /><button className="danger-button compact-button" type="submit">Excluir</button></form></RowActionsMenu></td></tr>) : <tr><td colSpan={7}>Nenhum veiculo cadastrado.</td></tr>}
    </tbody></table></div></section></>;
}
