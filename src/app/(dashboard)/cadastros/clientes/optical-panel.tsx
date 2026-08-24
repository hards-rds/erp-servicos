type EyeData = { sphere?: string | null; cylinder?: string | null; axis?: string | null; addition?: string | null; pd?: string | null };
type ClinicalData = { complaint?: string | null; lensType?: string | null; binocularPd?: string | null; frameNotes?: string | null };
export type OpticalRecord = {
  id: string;
  exam_date: string;
  professional_name: string | null;
  right_eye: EyeData | null;
  left_eye: EyeData | null;
  clinical_data: ClinicalData | null;
  notes: string | null;
};

function formatEye(eye: EyeData | null) {
  if (!eye) return "-";
  const values = [
    eye.sphere ? `Esf. ${eye.sphere}` : "",
    eye.cylinder ? `Cil. ${eye.cylinder}` : "",
    eye.axis ? `Eixo ${eye.axis}` : "",
    eye.addition ? `Ad. ${eye.addition}` : "",
    eye.pd ? `DNP ${eye.pd}` : ""
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "-";
}

export function OpticalPanel({ clientId, records }: { clientId: string; records: OpticalRecord[] }) {
  return (
    <section className="table-panel page-form-panel">
      <h2>Prontuario optico</h2>
      <form className="form-stack" action="/api/cadastros/clientes/optica" method="post">
        <input type="hidden" name="clientId" value={clientId} />
        <div className="form-grid">
          <label>Data da avaliacao<input name="examDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
          <label>Profissional<input name="professionalName" placeholder="Optometrista, oftalmo ou responsavel" /></label>
          <label>Queixa principal<input name="complaint" placeholder="Ex.: dificuldade para perto" /></label>
          <label>Tipo de lente<input name="lensType" placeholder="Ex.: simples, multifocal, blue cut" /></label>
        </div>
        <fieldset className="form-fieldset">
          <legend>Olho direito</legend>
          <div className="form-grid">
            <label>Esferico<input name="rightSphere" placeholder="-1.25" /></label>
            <label>Cilindrico<input name="rightCylinder" placeholder="-0.50" /></label>
            <label>Eixo<input name="rightAxis" inputMode="numeric" placeholder="180" /></label>
            <label>Adicao<input name="rightAddition" placeholder="+2.00" /></label>
            <label>DNP<input name="rightPd" placeholder="31" /></label>
            <label>Acuidade<input name="visualAcuityRight" placeholder="20/20" /></label>
          </div>
        </fieldset>
        <fieldset className="form-fieldset">
          <legend>Olho esquerdo</legend>
          <div className="form-grid">
            <label>Esferico<input name="leftSphere" placeholder="-1.00" /></label>
            <label>Cilindrico<input name="leftCylinder" placeholder="-0.25" /></label>
            <label>Eixo<input name="leftAxis" inputMode="numeric" placeholder="175" /></label>
            <label>Adicao<input name="leftAddition" placeholder="+2.00" /></label>
            <label>DNP<input name="leftPd" placeholder="31" /></label>
            <label>Acuidade<input name="visualAcuityLeft" placeholder="20/25" /></label>
          </div>
        </fieldset>
        <div className="form-grid">
          <label>DP binocular<input name="binocularPd" placeholder="62" /></label>
          <label>Armacao / medidas<input name="frameNotes" placeholder="Ponte, altura e observacoes" /></label>
        </div>
        <label>Observacoes clinicas<textarea name="notes" placeholder="Historico, adaptacao e recomendacoes" /></label>
        <div className="page-form-actions"><button className="primary-button" type="submit">Salvar no historico</button></div>
      </form>
      <div className="embedded-section">
        <h3>Historico de graus e evolucao clinica</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Data</th><th>OD</th><th>OE</th><th>Dados clinicos</th></tr></thead>
            <tbody>
              {records.length ? records.map((record) => {
                const clinical = record.clinical_data || {};
                return (
                  <tr key={record.id}>
                    <td><strong>{new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${record.exam_date}T00:00:00Z`))}</strong><div className="muted">{record.professional_name || "Profissional nao informado"}</div></td>
                    <td>{formatEye(record.right_eye)}</td>
                    <td>{formatEye(record.left_eye)}</td>
                    <td>
                      {clinical.complaint ? <div>{clinical.complaint}</div> : null}
                      {clinical.lensType ? <div className="muted">Lente: {clinical.lensType}</div> : null}
                      {clinical.binocularPd ? <div className="muted">DP: {clinical.binocularPd}</div> : null}
                      {clinical.frameNotes ? <div className="muted">Armacao: {clinical.frameNotes}</div> : null}
                      {record.notes ? <div className="table-error-detail">{record.notes}</div> : null}
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={4}>Nenhum grau registrado para este cliente.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
