import { PageHeader } from "@/components/layout/page-header";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { getSchoolContext } from "@/lib/school/server";

type PageProps = { searchParams?: Promise<{ status?: string }> };
type Relation<T> = T | T[] | null;
type AthleteRow = {
  id: string;
  full_name: string;
  birth_date: string;
  preferred_position: string | null;
  category: string | null;
  status: string;
  school_guardians: Relation<{ full_name: string; phone: string | null }>;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Atleta e responsavel cadastrados com sucesso." },
  updated: { kind: "success", text: "Cadastro do atleta atualizado." },
  deleted: { kind: "success", text: "Atleta excluido com sucesso." },
  duplicate: { kind: "error", text: "Ja existe um atleta ou responsavel com esse documento." },
  linked: { kind: "error", text: "O atleta possui matricula e nao pode ser excluido." },
  invalid_document: { kind: "error", text: "Revise o CPF/CNPJ informado." },
  invalid_client: { kind: "error", text: "O cliente financeiro nao pertence a empresa ativa." },
  forbidden: { kind: "error", text: "Este modulo esta disponivel apenas para escolas de futebol." },
  invalid: { kind: "error", text: "Preencha os dados obrigatorios do atleta e do responsavel." },
  error: { kind: "error", text: "Nao foi possivel concluir a operacao agora." }
};

function first<T>(relation: Relation<T>) {
  return Array.isArray(relation) ? relation[0] : relation;
}

function age(birthDate: string) {
  const birth = new Date(`${birthDate}T12:00:00`);
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) years -= 1;
  return years;
}

export default async function AthletesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getSchoolContext();
  const companyId = context.profile?.company_id;
  const { data: athletes } = context.allowed && companyId
    ? await context.supabase.from("school_athletes")
      .select("id,full_name,birth_date,preferred_position,category,status,school_guardians(full_name,phone)")
      .eq("company_id", companyId).order("full_name")
    : { data: [] };
  const message = params?.status ? messages[params.status] : null;

  return <>
    <PageHeader area="Escola / Atletas" title="Atletas" description="Cadastros esportivos, responsaveis e historico de evolucao." action={<a className="primary-button button-link" href="/escola/atletas/novo">Novo atleta</a>} />
    {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
    <section className="table-panel">
      <h2>Atletas cadastrados</h2>
      <div className="table-wrap"><table>
        <thead><tr><th>Atleta</th><th>Idade</th><th>Categoria</th><th>Posicao</th><th>Responsavel</th><th>Status</th><th>Acoes</th></tr></thead>
        <tbody>{(athletes as AthleteRow[] | null)?.length ? (athletes as AthleteRow[]).map((athlete) => {
          const guardian = first(athlete.school_guardians);
          return <tr key={athlete.id}>
            <td><strong>{athlete.full_name}</strong></td><td>{age(athlete.birth_date)} anos</td><td>{athlete.category || "-"}</td><td>{athlete.preferred_position || "-"}</td>
            <td>{guardian?.full_name || "-"}{guardian?.phone ? <div className="muted">{guardian.phone}</div> : null}</td>
            <td><span className={`badge ${athlete.status === "ativo" ? "success" : "neutral"}`}>{athlete.status}</span></td>
            <td><RowActionsMenu label={`Acoes do atleta ${athlete.full_name}`}>
              <a className="ghost-button button-link compact-button" href={`/escola/atletas/${athlete.id}/editar`}>Editar e avaliar</a>
              <form action="/api/escola/atletas" method="post"><input type="hidden" name="action" value="delete" /><input type="hidden" name="athleteId" value={athlete.id} /><button className="danger-button compact-button" type="submit">Excluir</button></form>
            </RowActionsMenu></td>
          </tr>;
        }) : <tr><td colSpan={7}>Nenhum atleta cadastrado.</td></tr>}</tbody>
      </table></div>
    </section>
  </>;
}
