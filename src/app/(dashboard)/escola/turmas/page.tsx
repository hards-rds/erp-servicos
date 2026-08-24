import { PageHeader } from "@/components/layout/page-header";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { getSchoolContext } from "@/lib/school/server";

type PageProps = { searchParams?: Promise<{ status?: string }> };
type ClassRow = { id: string; name: string; category: string; coach_name: string | null; capacity: number | null; schedule: { days?: string; startTime?: string; endTime?: string }; location: string | null; default_monthly_fee: number; active: boolean };
const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Turma cadastrada com sucesso." }, updated: { kind: "success", text: "Turma atualizada." }, deleted: { kind: "success", text: "Turma excluida." },
  duplicate: { kind: "error", text: "Ja existe uma turma com esse nome." }, linked: { kind: "error", text: "A turma possui matriculas e nao pode ser excluida." },
  invalid: { kind: "error", text: "Revise nome, categoria, capacidade e mensalidade." }, forbidden: { kind: "error", text: "Modulo exclusivo de escola de futebol." }, error: { kind: "error", text: "Nao foi possivel concluir a operacao." }
};

export default async function ClassesPage({ searchParams }: PageProps) {
  const params = await searchParams; const context = await getSchoolContext(); const companyId = context.profile?.company_id;
  const { data: classes } = context.allowed && companyId ? await context.supabase.from("school_classes").select("id,name,category,coach_name,capacity,schedule,location,default_monthly_fee,active").eq("company_id", companyId).order("name") : { data: [] };
  const message = params?.status ? messages[params.status] : null;
  return <><PageHeader area="Escola / Turmas" title="Turmas" description="Categorias, treinadores, horarios e capacidade." action={<a className="primary-button button-link" href="/escola/turmas/nova">Nova turma</a>} />
    {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
    <section className="table-panel"><h2>Turmas cadastradas</h2><div className="table-wrap"><table><thead><tr><th>Turma</th><th>Treinador</th><th>Agenda</th><th>Local</th><th>Mensalidade</th><th>Status</th><th>Acoes</th></tr></thead><tbody>
      {(classes as ClassRow[] | null)?.length ? (classes as ClassRow[]).map((item) => <tr key={item.id}><td><strong>{item.name}</strong><div className="muted">{item.category}{item.capacity ? ` · ate ${item.capacity} atletas` : ""}</div></td><td>{item.coach_name || "-"}</td><td>{item.schedule?.days || "-"}{item.schedule?.startTime ? <div className="muted">{item.schedule.startTime} - {item.schedule.endTime || ""}</div> : null}</td><td>{item.location || "-"}</td><td>{Number(item.default_monthly_fee).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td><td><span className={`badge ${item.active ? "success" : "neutral"}`}>{item.active ? "ativa" : "inativa"}</span></td><td><RowActionsMenu label={`Acoes da turma ${item.name}`}><a className="ghost-button button-link compact-button" href={`/escola/turmas/${item.id}/editar`}>Editar</a><form action="/api/escola/turmas" method="post"><input type="hidden" name="action" value="delete" /><input type="hidden" name="classId" value={item.id} /><button className="danger-button compact-button" type="submit">Excluir</button></form></RowActionsMenu></td></tr>) : <tr><td colSpan={7}>Nenhuma turma cadastrada.</td></tr>}
    </tbody></table></div></section></>;
}
