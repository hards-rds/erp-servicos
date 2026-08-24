import { notFound } from "next/navigation";
import { AthleteForm, type AthleteFormValue } from "@/components/school/athlete-form";
import { PageHeader } from "@/components/layout/page-header";
import { getSchoolContext } from "@/lib/school/server";

type PageProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ status?: string }> };
type Evaluation = {
  id: string; evaluation_date: string; evaluator_name: string; physical_data: Record<string, number | null>;
  technical_data: Record<string, number | null>; tactical_data: Record<string, number | null>; notes: string | null;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  evaluation_created: { kind: "success", text: "Avaliacao adicionada ao historico do atleta." },
  evaluation_invalid: { kind: "error", text: "Informe data e avaliador." },
  evaluation_error: { kind: "error", text: "Nao foi possivel salvar a avaliacao." },
  duplicate: { kind: "error", text: "Documento ja utilizado em outro cadastro." },
  error: { kind: "error", text: "Nao foi possivel salvar as alteracoes." }
};

function score(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : value.toLocaleString("pt-BR");
}

export default async function EditAthletePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = await searchParams;
  const context = await getSchoolContext();
  const companyId = context.profile?.company_id;
  if (!context.allowed || !companyId) notFound();

  const [{ data: athlete }, { data: clients }, { data: evaluations }] = await Promise.all([
    context.supabase.from("school_athletes")
      .select("id,full_name,document,birth_date,preferred_position,dominant_foot,category,emergency_contact,medical_notes,image_authorization,data_consent_at,status,guardian:school_guardians(id,client_id,full_name,document,relationship,email,phone,emergency_phone)")
      .eq("id", id).eq("company_id", companyId).maybeSingle(),
    context.supabase.from("clients").select("id,legal_name,document").eq("company_id", companyId).eq("status", "ativo").order("legal_name"),
    context.supabase.from("school_athlete_evaluations").select("id,evaluation_date,evaluator_name,physical_data,technical_data,tactical_data,notes").eq("company_id", companyId).eq("athlete_id", id).order("evaluation_date", { ascending: false })
  ]);
  if (!athlete) notFound();
  const message = query?.status ? messages[query.status] : null;

  return <>
    <PageHeader area="Escola / Atletas / Editar" title={athlete.full_name} description="Dados cadastrais e evolucao esportiva preservada em historico." action={<a className="ghost-button button-link" href="/escola/atletas">Voltar</a>} />
    {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
    <section className="form-panel page-form-panel"><AthleteForm clients={clients || []} athlete={athlete as AthleteFormValue} /></section>
    <section className="form-panel page-form-panel">
      <h2>Nova avaliacao</h2>
      <form className="form-stack" action="/api/escola/atletas" method="post">
        <input type="hidden" name="action" value="add_evaluation" /><input type="hidden" name="athleteId" value={id} />
        <div className="form-grid"><label>Data<input name="evaluationDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label>Avaliador<input name="evaluatorName" required /></label></div>
        <fieldset><legend>Fisico (0 a 10)</legend><div className="form-grid"><label>Velocidade<input name="speed" type="number" min="0" max="10" step="0.1" /></label><label>Resistencia<input name="endurance" type="number" min="0" max="10" step="0.1" /></label><label>Forca<input name="strength" type="number" min="0" max="10" step="0.1" /></label></div></fieldset>
        <fieldset><legend>Tecnico (0 a 10)</legend><div className="form-grid"><label>Passe<input name="passing" type="number" min="0" max="10" step="0.1" /></label><label>Finalizacao<input name="shooting" type="number" min="0" max="10" step="0.1" /></label><label>Drible<input name="dribbling" type="number" min="0" max="10" step="0.1" /></label><label>Marcacao<input name="marking" type="number" min="0" max="10" step="0.1" /></label></div></fieldset>
        <fieldset><legend>Tatico e comportamental (0 a 10)</legend><div className="form-grid"><label>Leitura de jogo<input name="gameReading" type="number" min="0" max="10" step="0.1" /></label><label>Disciplina<input name="discipline" type="number" min="0" max="10" step="0.1" /></label></div></fieldset>
        <label>Observacoes<textarea name="evaluationNotes" /></label><button className="primary-button" type="submit">Adicionar ao historico</button>
      </form>
    </section>
    <section className="table-panel"><h2>Historico de avaliacoes</h2><div className="table-wrap"><table>
      <thead><tr><th>Data</th><th>Avaliador</th><th>Fisico</th><th>Tecnico</th><th>Tatico</th><th>Observacoes</th></tr></thead>
      <tbody>{(evaluations as Evaluation[] | null)?.length ? (evaluations as Evaluation[]).map((evaluation) => <tr key={evaluation.id}>
        <td>{new Date(`${evaluation.evaluation_date}T12:00:00`).toLocaleDateString("pt-BR")}</td><td>{evaluation.evaluator_name}</td>
        <td>Vel. {score(evaluation.physical_data.speed)} · Res. {score(evaluation.physical_data.endurance)} · Forca {score(evaluation.physical_data.strength)}</td>
        <td>Passe {score(evaluation.technical_data.passing)} · Final. {score(evaluation.technical_data.shooting)} · Drible {score(evaluation.technical_data.dribbling)}</td>
        <td>Leitura {score(evaluation.tactical_data.gameReading)} · Disc. {score(evaluation.tactical_data.discipline)}</td><td>{evaluation.notes || "-"}</td>
      </tr>) : <tr><td colSpan={6}>Nenhuma avaliacao registrada.</td></tr>}</tbody>
    </table></div></section>
  </>;
}
