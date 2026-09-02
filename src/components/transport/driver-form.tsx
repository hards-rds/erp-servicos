export type DriverFormValue = {
  id?: string; full_name?: string; document?: string; cnh_number?: string; cnh_category?: string;
  cnh_expires_at?: string; phone?: string | null; email?: string | null; employment_type?: string;
  status?: string; emergency_contact?: string | null; notes?: string | null;
};

export function DriverForm({ driver }: { driver?: DriverFormValue }) {
  return <form className="form-stack" action="/api/transporte/motoristas" method="post">
    <input type="hidden" name="action" value={driver?.id ? "update" : "create"} />
    {driver?.id ? <input type="hidden" name="driverId" value={driver.id} /> : null}
    <fieldset><legend>Motorista</legend>
      <label>Nome completo<input name="fullName" defaultValue={driver?.full_name || ""} required /></label>
      <div className="form-grid">
        <label>CPF<input name="document" defaultValue={driver?.document || ""} inputMode="numeric" required /></label>
        <label>CNH<input name="cnhNumber" defaultValue={driver?.cnh_number || ""} inputMode="numeric" required /></label>
        <label>Categoria da CNH<input name="cnhCategory" defaultValue={driver?.cnh_category || ""} placeholder="Ex.: E" required /></label>
        <label>Validade da CNH<input name="cnhExpiresAt" type="date" defaultValue={driver?.cnh_expires_at || ""} required /></label>
      </div>
      <div className="form-grid"><label>Telefone<input name="phone" defaultValue={driver?.phone || ""} /></label><label>E-mail<input name="email" type="email" defaultValue={driver?.email || ""} /></label><label>Contato de emergencia<input name="emergencyContact" defaultValue={driver?.emergency_contact || ""} /></label></div>
    </fieldset>
    <fieldset><legend>Vinculo</legend><div className="form-grid">
      <label>Tipo<select name="employmentType" defaultValue={driver?.employment_type || "proprio"}><option value="proprio">Proprio</option><option value="agregado">Agregado</option><option value="terceiro">Terceiro</option></select></label>
      <label>Status<select name="status" defaultValue={driver?.status || "ativo"}><option value="ativo">Ativo</option><option value="afastado">Afastado</option><option value="inativo">Inativo</option></select></label>
    </div><label>Observacoes<textarea name="notes" defaultValue={driver?.notes || ""} /></label></fieldset>
    <button className="primary-button" type="submit">{driver?.id ? "Salvar motorista" : "Cadastrar motorista"}</button>
  </form>;
}
