export type SchoolClassValue = {
  id?: string; name?: string; category?: string; age_group?: string | null; coach_name?: string | null;
  capacity?: number | null; schedule?: { days?: string; startTime?: string; endTime?: string } | null;
  location?: string | null; default_monthly_fee?: number | string; active?: boolean;
};

export function SchoolClassForm({ schoolClass }: { schoolClass?: SchoolClassValue }) {
  return <form className="form-stack" action="/api/escola/turmas" method="post">
    <input type="hidden" name="action" value={schoolClass?.id ? "update" : "create"} />
    {schoolClass?.id ? <input type="hidden" name="classId" value={schoolClass.id} /> : null}
    <label>Nome da turma<input name="name" defaultValue={schoolClass?.name || ""} placeholder="Ex.: Sub-11 Manha" required /></label>
    <div className="form-grid"><label>Categoria<input name="category" defaultValue={schoolClass?.category || ""} placeholder="Ex.: Sub-11" required /></label><label>Faixa etaria<input name="ageGroup" defaultValue={schoolClass?.age_group || ""} placeholder="Ex.: 9 a 11 anos" /></label></div>
    <div className="form-grid"><label>Treinador<input name="coachName" defaultValue={schoolClass?.coach_name || ""} /></label><label>Capacidade<input name="capacity" type="number" min="1" defaultValue={schoolClass?.capacity || ""} /></label></div>
    <fieldset><legend>Agenda</legend>
      <label>Dias da semana<input name="scheduleDays" defaultValue={schoolClass?.schedule?.days || ""} placeholder="Ex.: Segundas e quartas" /></label>
      <div className="form-grid"><label>Inicio<input name="startTime" type="time" defaultValue={schoolClass?.schedule?.startTime || ""} /></label><label>Termino<input name="endTime" type="time" defaultValue={schoolClass?.schedule?.endTime || ""} /></label></div>
      <label>Local<input name="location" defaultValue={schoolClass?.location || ""} /></label>
    </fieldset>
    <div className="form-grid"><label>Mensalidade padrao<input name="monthlyFee" inputMode="decimal" defaultValue={Number(schoolClass?.default_monthly_fee || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} required /></label><label>Status<select name="active" defaultValue={schoolClass?.active === false ? "false" : "true"}><option value="true">Ativa</option><option value="false">Inativa</option></select></label></div>
    <button className="primary-button" type="submit">{schoolClass?.id ? "Salvar alteracoes" : "Cadastrar turma"}</button>
  </form>;
}
