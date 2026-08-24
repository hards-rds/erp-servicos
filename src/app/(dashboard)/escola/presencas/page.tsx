import { PageHeader } from "@/components/layout/page-header";
import { getSchoolContext } from "@/lib/school/server";

type PageProps = { searchParams?: Promise<{ classId?: string; date?: string; status?: string }> };
type Relation<T> = T | T[] | null;
type Enrollment = { id: string; athlete_id: string; school_athletes: Relation<{ full_name: string }> };
type Attendance = { enrollment_id: string; status: string; notes: string | null };
function first<T>(value: Relation<T>) { return Array.isArray(value) ? value[0] : value; }

export default async function AttendancePage({ searchParams }: PageProps) {
  const params = await searchParams; const context = await getSchoolContext(); const companyId = context.profile?.company_id;
  const selectedDate = params?.date || new Date().toISOString().slice(0, 10); const classId = params?.classId || "";
  const { data: classes } = context.allowed && companyId ? await context.supabase.from("school_classes").select("id,name,category").eq("company_id", companyId).eq("active", true).order("name") : { data: [] };
  const [{ data: enrollments }, { data: attendance }] = context.allowed && companyId && classId ? await Promise.all([
    context.supabase.from("school_enrollments").select("id,athlete_id,school_athletes(full_name)").eq("company_id", companyId).eq("class_id", classId).eq("status", "ativa").order("created_at"),
    context.supabase.from("school_attendance").select("enrollment_id,status,notes").eq("company_id", companyId).eq("class_id", classId).eq("attendance_date", selectedDate)
  ]) : [{ data: [] }, { data: [] }];
  const saved = params?.status === "saved"; const error = params?.status && params.status !== "saved";
  const attendanceMap = new Map(((attendance || []) as Attendance[]).map((row) => [row.enrollment_id, row]));
  return <><PageHeader area="Escola / Presencas" title="Chamada" description="Registre presencas, faltas e justificativas por turma e data." />
    {saved ? <div className="form-success">Chamada salva com sucesso.</div> : null}{error ? <div className="form-error">Nao foi possivel salvar a chamada. Revise turma e data.</div> : null}
    <section className="form-panel"><form className="filter-grid" method="get"><label>Turma<select name="classId" defaultValue={classId}><option value="">Selecione uma turma</option>{(classes || []).map((item) => <option key={item.id} value={item.id}>{item.name} - {item.category}</option>)}</select></label><label>Data<input name="date" type="date" defaultValue={selectedDate} /></label><button className="primary-button" type="submit">Carregar chamada</button></form></section>
    {classId ? <section className="table-panel"><h2>Atletas da turma</h2><form action="/api/escola/presencas" method="post"><input type="hidden" name="classId" value={classId} /><input type="hidden" name="attendanceDate" value={selectedDate} /><div className="table-wrap"><table><thead><tr><th>Atleta</th><th>Situacao</th><th>Observacao</th></tr></thead><tbody>
      {(enrollments as Enrollment[] | null)?.length ? (enrollments as Enrollment[]).map((enrollment) => { const athlete = first(enrollment.school_athletes); const current = attendanceMap.get(enrollment.id); return <tr key={enrollment.id}><td><strong>{athlete?.full_name || "Atleta"}</strong></td><td><select name={`status_${enrollment.id}`} defaultValue={current?.status || "presente"}><option value="presente">Presente</option><option value="ausente">Ausente</option><option value="justificada">Falta justificada</option></select></td><td><input name={`notes_${enrollment.id}`} defaultValue={current?.notes || ""} placeholder="Opcional" /></td></tr>; }) : <tr><td colSpan={3}>Nenhuma matricula ativa nesta turma.</td></tr>}
      </tbody></table></div>{(enrollments || []).length ? <button className="primary-button" type="submit">Salvar chamada</button> : null}</form></section> : null}
  </>;
}
