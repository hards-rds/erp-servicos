type ClientOption = { id: string; legal_name: string; document: string };

export type AthleteFormValue = {
  id?: string;
  full_name?: string;
  document?: string | null;
  birth_date?: string;
  preferred_position?: string | null;
  dominant_foot?: string | null;
  category?: string | null;
  emergency_contact?: string | null;
  medical_notes?: string | null;
  image_authorization?: boolean;
  data_consent_at?: string | null;
  status?: string;
  guardian?: {
    client_id?: string | null;
    full_name?: string;
    document?: string | null;
    relationship?: string | null;
    email?: string | null;
    phone?: string | null;
    emergency_phone?: string | null;
  } | null;
};

export function AthleteForm({ clients, athlete }: { clients: ClientOption[]; athlete?: AthleteFormValue }) {
  const guardian = athlete?.guardian;
  return (
    <form className="form-stack" action="/api/escola/atletas" method="post">
      <input type="hidden" name="action" value={athlete?.id ? "update" : "create"} />
      {athlete?.id ? <input type="hidden" name="athleteId" value={athlete.id} /> : null}

      <fieldset>
        <legend>Atleta</legend>
        <label>Nome completo<input name="fullName" defaultValue={athlete?.full_name || ""} required /></label>
        <div className="form-grid">
          <label>CPF<input name="athleteDocument" defaultValue={athlete?.document || ""} placeholder="Opcional" /></label>
          <label>Data de nascimento<input name="birthDate" type="date" defaultValue={athlete?.birth_date || ""} required /></label>
        </div>
        <div className="form-grid">
          <label>
            Posicao preferencial
            <select name="preferredPosition" defaultValue={athlete?.preferred_position || ""}>
              <option value="">Nao definida</option>
              <option value="goleiro">Goleiro</option>
              <option value="lateral">Lateral</option>
              <option value="zagueiro">Zagueiro</option>
              <option value="volante">Volante</option>
              <option value="meia">Meia</option>
              <option value="atacante">Atacante</option>
            </select>
          </label>
          <label>
            Pe dominante
            <select name="dominantFoot" defaultValue={athlete?.dominant_foot || ""}>
              <option value="">Nao definido</option>
              <option value="direito">Direito</option>
              <option value="esquerdo">Esquerdo</option>
              <option value="ambos">Ambos</option>
            </select>
          </label>
        </div>
        <div className="form-grid">
          <label>Categoria<input name="category" defaultValue={athlete?.category || ""} placeholder="Ex.: Sub-11" /></label>
          <label>
            Status
            <select name="status" defaultValue={athlete?.status || "ativo"}>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </label>
        </div>
        <label>Contato de emergencia<input name="emergencyContact" defaultValue={athlete?.emergency_contact || ""} /></label>
        <label>Restricoes e observacoes de saude<textarea name="medicalNotes" defaultValue={athlete?.medical_notes || ""} /></label>
      </fieldset>

      <fieldset>
        <legend>Responsavel</legend>
        <label>Nome completo<input name="guardianName" defaultValue={guardian?.full_name || ""} required /></label>
        <div className="form-grid">
          <label>CPF/CNPJ<input name="guardianDocument" defaultValue={guardian?.document || ""} placeholder="Opcional" /></label>
          <label>Parentesco<input name="relationship" defaultValue={guardian?.relationship || ""} placeholder="Ex.: Mae, pai, responsavel" /></label>
        </div>
        <div className="form-grid">
          <label>E-mail<input name="guardianEmail" type="email" defaultValue={guardian?.email || ""} /></label>
          <label>Telefone<input name="guardianPhone" defaultValue={guardian?.phone || ""} /></label>
        </div>
        <label>Telefone de emergencia<input name="emergencyPhone" defaultValue={guardian?.emergency_phone || ""} /></label>
        <label>
          Cliente financeiro vinculado
          <select name="clientId" defaultValue={guardian?.client_id || ""}>
            <option value="">Sem vinculo financeiro</option>
            {clients.map((client) => <option value={client.id} key={client.id}>{client.legal_name} - {client.document}</option>)}
          </select>
        </label>
        <p className="form-hint">O vinculo permite identificar o pagador nas mensalidades e em uma futura emissao de NFS-e.</p>
      </fieldset>

      <fieldset className="checkbox-panel">
        <legend>Consentimentos</legend>
        <label className="checkbox-row"><input name="dataConsent" type="checkbox" defaultChecked={Boolean(athlete?.data_consent_at)} /> Consentimento para tratamento dos dados do atleta</label>
        <label className="checkbox-row"><input name="imageAuthorization" type="checkbox" defaultChecked={Boolean(athlete?.image_authorization)} /> Autorizacao de uso de imagem</label>
      </fieldset>

      <button className="primary-button" type="submit">{athlete?.id ? "Salvar alteracoes" : "Cadastrar atleta"}</button>
    </form>
  );
}
