import { PageHeader } from "@/components/layout/page-header";
import { SchoolClassForm } from "@/components/school/class-form";
import { getSchoolContext } from "@/lib/school/server";

export default async function NewClassPage() {
  const context = await getSchoolContext();
  return <><PageHeader area="Escola / Turmas / Nova" title="Nova turma" description="Defina categoria, agenda e mensalidade sugerida." action={<a className="ghost-button button-link" href="/escola/turmas">Voltar</a>} />{context.allowed ? <section className="form-panel page-form-panel"><SchoolClassForm /></section> : <div className="form-error">Selecione uma empresa do segmento Escola de futebol.</div>}</>;
}
