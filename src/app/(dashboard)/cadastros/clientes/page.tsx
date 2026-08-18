import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ClientForm } from "./client-form";

type ClientesPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

type ClientAddress = {
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  cityCode?: string;
  state?: string;
  zipCode?: string;
};

type ClientRow = {
  id: string;
  legal_name: string;
  trade_name: string | null;
  document: string;
  municipal_registration: string | null;
  state_registration: string | null;
  fiscal_email: string | null;
  financial_email: string | null;
  phone: string | null;
  address: ClientAddress | null;
  internal_notes: string | null;
  status: string;
  created_at: string;
};

type EyeData = {
  sphere?: string | null;
  cylinder?: string | null;
  axis?: string | null;
  addition?: string | null;
  pd?: string | null;
};

type ClinicalData = {
  complaint?: string | null;
  visualAcuityRight?: string | null;
  visualAcuityLeft?: string | null;
  binocularPd?: string | null;
  lensType?: string | null;
  frameNotes?: string | null;
};

type OpticalRecord = {
  id: string;
  client_id: string;
  exam_date: string;
  professional_name: string | null;
  right_eye: EyeData | null;
  left_eye: EyeData | null;
  clinical_data: ClinicalData | null;
  notes: string | null;
  created_at: string;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Cliente cadastrado com sucesso." },
  updated: { kind: "success", text: "Cliente atualizado com sucesso." },
  deleted: { kind: "success", text: "Cliente excluido com sucesso." },
  optical_created: { kind: "success", text: "Registro optico salvo no historico do cliente." },
  duplicate: { kind: "error", text: "Ja existe um cliente com esse CPF/CNPJ." },
  invalid: { kind: "error", text: "Revise CPF/CNPJ e nome antes de salvar." },
  optical_invalid: { kind: "error", text: "Revise cliente e data antes de salvar o registro optico." },
  optical_error: { kind: "error", text: "Nao foi possivel salvar o registro optico agora." },
  invalid_delete: { kind: "error", text: "Nao foi possivel identificar o cliente para excluir." },
  delete_not_found: { kind: "error", text: "Cliente nao encontrado na empresa ativa ou ja excluido." },
  delete_linked: { kind: "error", text: "Este cliente tem vinculos em servicos, contratos ou financeiro e nao pode ser excluido." },
  delete_error: { kind: "error", text: "Nao foi possivel excluir o cliente agora." },
  update_error: { kind: "error", text: "Nao foi possivel atualizar o cliente agora." },
  error: { kind: "error", text: "Nao foi possivel cadastrar o cliente agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatDocument(value: string) {
  if (value.length === 11) {
    return value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return value.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatEye(eye: EyeData | null) {
  if (!eye) return "-";
  const items = [
    eye.sphere ? `Esf. ${eye.sphere}` : "",
    eye.cylinder ? `Cil. ${eye.cylinder}` : "",
    eye.axis ? `Eixo ${eye.axis}` : "",
    eye.addition ? `Ad. ${eye.addition}` : "",
    eye.pd ? `DNP ${eye.pd}` : ""
  ].filter(Boolean);
  return items.length ? items.join(" · ") : "-";
}

function groupOpticalRecords(records: OpticalRecord[]) {
  return records.reduce<Record<string, OpticalRecord[]>>((acc, record) => {
    acc[record.client_id] = [...(acc[record.client_id] || []), record];
    return acc;
  }, {});
}

function OpticalRecordForm({ client }: { client: ClientRow }) {
  return (
    <form className="form-stack" action="/api/cadastros/clientes/optica" method="post">
      <input type="hidden" name="clientId" value={client.id} />
      <div className="form-grid">
        <label>
          Data da avaliacao
          <input name="examDate" type="date" defaultValue={todayIso()} required />
        </label>
        <label>
          Profissional
          <input name="professionalName" placeholder="Optometrista, oftalmo ou responsavel" />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Queixa principal
          <input name="complaint" placeholder="Ex.: dificuldade para perto, cefaleia..." />
        </label>
        <label>
          Tipo de lente
          <input name="lensType" placeholder="Ex.: simples, multifocal, blue cut..." />
        </label>
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
        <label>
          DP binocular
          <input name="binocularPd" placeholder="62" />
        </label>
        <label>
          Armacao / medidas
          <input name="frameNotes" placeholder="Ponte, altura, observacoes da armacao" />
        </label>
      </div>
      <label>
        Observacoes clinicas
        <textarea name="notes" placeholder="Historico, adaptacao, recomendacoes e acompanhamento" />
      </label>
      <button className="primary-button" type="submit">Salvar registro optico</button>
    </form>
  );
}

function OpticalHistory({ records }: { records: OpticalRecord[] }) {
  if (!records.length) {
    return <div className="muted">Nenhum grau registrado para este cliente.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>OD</th>
            <th>OE</th>
            <th>Dados clinicos</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const clinical = record.clinical_data || {};
            return (
              <tr key={record.id}>
                <td>
                  <strong>{formatDate(record.exam_date)}</strong>
                  <div className="muted">{record.professional_name || "Profissional nao informado"}</div>
                </td>
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
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ClientesPage({ searchParams }: ClientesPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle()
    : { data: null };
  const isOpticalTenant = company?.service_segment === "otica";
  const { data: clients } = profile?.company_id
    ? await supabase
      .from("clients")
      .select("id,legal_name,trade_name,document,municipal_registration,state_registration,fiscal_email,financial_email,phone,address,internal_notes,status,created_at")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(50)
    : { data: [] };
  const { data: opticalRecords } = isOpticalTenant && profile?.company_id
    ? await supabase
      .from("client_optical_records")
      .select("id,client_id,exam_date,professional_name,right_eye,left_eye,clinical_data,notes,created_at")
      .eq("company_id", profile.company_id)
      .order("exam_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300)
    : { data: [] };
  const message = params?.status ? statusMessages[params.status] : null;
  const allClients = (clients || []) as ClientRow[];
  const recordsByClient = groupOpticalRecords((opticalRecords || []) as OpticalRecord[]);

  return (
    <>
      <PageHeader
        area="Cadastros / Clientes"
        title="Clientes"
        description="Cadastro fiscal, financeiro e contatos de clientes recorrentes ou esporadicos."
        action={<a className="primary-button button-link" href="/cadastros/servicos">Criar servico</a>}
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}
      <div className="two-columns">
        <section className="table-panel">
          <h2>Clientes cadastrados</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nome/Razao social</th>
                  <th>CPF/CNPJ</th>
                  <th>E-mail fiscal</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {allClients.length ? (
                  allClients.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <strong>{client.legal_name}</strong>
                        {client.trade_name ? <div className="muted">{client.trade_name}</div> : null}
                      </td>
                      <td>{formatDocument(client.document)}</td>
                      <td>{client.fiscal_email || "-"}</td>
                      <td><span className="badge success">{client.status}</span></td>
                      <td>
                        <div className="row-actions">
                          <a className="ghost-button button-link compact-button" href={`#editar-${client.id}`}>Editar</a>
                          <form action="/api/cadastros/clientes" method="post">
                            <input type="hidden" name="action" value="delete" />
                            <input type="hidden" name="clientId" value={client.id} />
                            <button className="danger-button compact-button" type="submit">Excluir</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>Nenhum cliente cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Novo cliente</h2>
          <ClientForm />
        </section>
      </div>
      <section className="table-panel">
        <h2>Editar clientes</h2>
        <div className="settings-list">
          {allClients.length ? (
            allClients.map((client) => (
              <details className="details-panel" id={`editar-${client.id}`} key={client.id}>
                <summary>
                  <span>
                    <strong>{client.legal_name}</strong>
                    <span className="muted">{formatDocument(client.document)}</span>
                  </span>
                </summary>
                <ClientForm
                  action="update"
                  submitLabel="Salvar cliente"
                  initialValues={{
                    id: client.id,
                    document: client.document,
                    legalName: client.legal_name,
                    tradeName: client.trade_name || "",
                    phone: client.phone || "",
                    fiscalEmail: client.fiscal_email || "",
                    financialEmail: client.financial_email || "",
                    municipalRegistration: client.municipal_registration || "",
                    stateRegistration: client.state_registration || "",
                    internalNotes: client.internal_notes || "",
                    address: client.address || {}
                  }}
                />
                {isOpticalTenant ? (
                  <div className="embedded-section">
                    <h3>Prontuario optico</h3>
                    <OpticalRecordForm client={client} />
                    <h3>Historico de graus e evolucao clinica</h3>
                    <OpticalHistory records={recordsByClient[client.id] || []} />
                  </div>
                ) : null}
              </details>
            ))
          ) : (
            <div className="muted">Nenhum cliente para editar.</div>
          )}
        </div>
      </section>
    </>
  );
}
