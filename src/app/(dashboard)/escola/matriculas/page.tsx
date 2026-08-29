import { PageHeader } from "@/components/layout/page-header";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { getSchoolContext } from "@/lib/school/server";

type PageProps = { searchParams?: Promise<{ status?: string }> };
type Relation<T> = T | T[] | null;
type EnrollmentRow = { id: string; starts_at: string; due_day: number; monthly_amount: number; discount_amount: number; status: string; auto_generate_financial: boolean; school_athletes: Relation<{ full_name: string }>; school_classes: Relation<{ name: string; category: string }>; school_guardians: Relation<{ full_name: string; client_id: string | null }> };
const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Matricula criada com sucesso." }, updated: { kind: "success", text: "Matricula atualizada." }, deleted: { kind: "success", text: "Matricula excluida." },
  financial_generated: { kind: "success", text: "Mensalidade da competencia adicionada ao financeiro e ao fluxo de caixa." }, financial_error: { kind: "error", text: "Nao foi possivel gerar a mensalidade." },
  duplicate: { kind: "error", text: "O atleta ja possui matricula ativa nessa turma." }, linked: { kind: "error", text: "A matricula ja possui historico financeiro e nao pode ser excluida." },
  plan_limit: { kind: "error", text: "O limite de contratos e matriculas do plano foi atingido. Consulte Assinatura e plano." }, feature_unavailable: { kind: "error", text: "Automacoes recorrentes exigem o plano Pro ou Enterprise." },
  inactive: { kind: "error", text: "Apenas matriculas ativas podem gerar mensalidade." }, invalid_relation: { kind: "error", text: "Atleta ou turma nao pertence a empresa ativa." },
  invalid: { kind: "error", text: "Revise atleta, turma, valores e vencimento." }, forbidden: { kind: "error", text: "Modulo exclusivo de escola de futebol." }, error: { kind: "error", text: "Nao foi possivel concluir a operacao." }
};
function first<T>(value: Relation<T>) { return Array.isArray(value) ? value[0] : value; }

export default async function EnrollmentsPage({ searchParams }: PageProps) {
  const params = await searchParams; const context = await getSchoolContext(); const companyId = context.profile?.company_id;
  const { data } = context.allowed && companyId ? await context.supabase.from("school_enrollments").select("id,starts_at,due_day,monthly_amount,discount_amount,status,auto_generate_financial,school_athletes(full_name),school_classes(name,category),school_guardians(full_name,client_id)").eq("company_id", companyId).order("created_at", { ascending: false }) : { data: [] };
  const message = params?.status ? messages[params.status] : null;
  return <><PageHeader area="Escola / Matriculas" title="Matriculas" description="Planos, turmas e mensalidades recorrentes dos atletas." action={<a className="primary-button button-link" href="/escola/matriculas/nova">Nova matricula</a>} />
    {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
    <section className="table-panel"><h2>Matriculas</h2><div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Turma</th><th>Inicio</th><th>Mensalidade</th><th>Vencimento</th><th>Responsavel</th><th>Status</th><th>Automacao</th><th>Acoes</th></tr></thead><tbody>
      {(data as EnrollmentRow[] | null)?.length ? (data as EnrollmentRow[]).map((row) => { const athlete = first(row.school_athletes); const schoolClass = first(row.school_classes); const guardian = first(row.school_guardians); const net = Number(row.monthly_amount) - Number(row.discount_amount); return <tr key={row.id}><td><strong>{athlete?.full_name || "-"}</strong></td><td>{schoolClass?.name || "-"}<div className="muted">{schoolClass?.category}</div></td><td>{new Date(`${row.starts_at}T12:00:00`).toLocaleDateString("pt-BR")}</td><td>{net.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{Number(row.discount_amount) ? <div className="muted">com desconto</div> : null}</td><td>Dia {row.due_day}</td><td>{guardian?.full_name || "-"}{!guardian?.client_id ? <div className="muted">sem cliente financeiro</div> : null}</td><td><span className={`badge ${row.status === "ativa" ? "success" : "warning"}`}>{row.status}</span></td><td>{row.auto_generate_financial ? "Mensal" : "Manual"}</td><td><RowActionsMenu label={`Acoes da matricula de ${athlete?.full_name || "atleta"}`}><a className="ghost-button button-link compact-button" href={`/escola/matriculas/${row.id}/editar`}>Editar</a><form action="/api/escola/matriculas" method="post"><input type="hidden" name="action" value="generate_financial" /><input type="hidden" name="enrollmentId" value={row.id} /><button className="primary-button compact-button" type="submit" disabled={row.status !== "ativa"}>Gerar mensalidade</button></form><form action="/api/escola/matriculas" method="post"><input type="hidden" name="action" value="delete" /><input type="hidden" name="enrollmentId" value={row.id} /><button className="danger-button compact-button" type="submit">Excluir</button></form></RowActionsMenu></td></tr>; }) : <tr><td colSpan={9}>Nenhuma matricula cadastrada.</td></tr>}
    </tbody></table></div></section></>;
}
