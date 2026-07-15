import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ServicosPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

type ServiceRecord = {
  id: string;
  service_description: string;
  service_type: string;
  amount: number | string;
  service_date: string;
  due_date: string | null;
  status: string;
  fiscal_service_data: Record<string, unknown> | null;
  clients: {
    legal_name: string;
    document: string;
  } | {
    legal_name: string;
    document: string;
  }[] | null;
};

type ServiceSegment = "tecnologia" | "otica" | "generico";

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Servico cadastrado com sucesso." },
  invalid: { kind: "error", text: "Revise cliente, descricao e valor antes de salvar." },
  error: { kind: "error", text: "Nao foi possivel cadastrar o servico agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

const serviceTypeOptions: Record<ServiceSegment, { value: string; label: string }[]> = {
  tecnologia: [
    { value: "suporte", label: "Suporte" },
    { value: "manutencao", label: "Manutencao" },
    { value: "implantacao", label: "Implantacao" },
    { value: "consultoria", label: "Consultoria" },
    { value: "visita_tecnica", label: "Visita tecnica" },
    { value: "recorrente", label: "Recorrente" },
    { value: "avulso", label: "Avulso" }
  ],
  otica: [
    { value: "venda_oculos", label: "Venda de oculos" },
    { value: "lente", label: "Lente" },
    { value: "armacao", label: "Armacao" },
    { value: "ajuste", label: "Ajuste" },
    { value: "exame", label: "Exame" },
    { value: "garantia", label: "Garantia" },
    { value: "avulso", label: "Avulso" }
  ],
  generico: [
    { value: "avulso", label: "Avulso" },
    { value: "recorrente", label: "Recorrente" },
    { value: "consultoria", label: "Consultoria" },
    { value: "manutencao", label: "Manutencao" }
  ]
};

const segmentLabels: Record<ServiceSegment, string> = {
  tecnologia: "Tecnologia",
  otica: "Otica",
  generico: "Generico"
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getServiceClient(service: ServiceRecord) {
  return Array.isArray(service.clients) ? service.clients[0] : service.clients;
}

function getDetailSummary(service: ServiceRecord) {
  const details = service.fiscal_service_data || {};
  if (details.segment === "otica") {
    return [details.lensType, details.frameModel, details.deliveryDate ? `Entrega ${formatDate(String(details.deliveryDate))}` : ""]
      .filter(Boolean)
      .join(" · ");
  }

  if (details.segment === "tecnologia") {
    return [details.serviceMode, details.priority, details.ticketNumber].filter(Boolean).join(" · ");
  }

  return "";
}

export default async function ServicosPage({ searchParams }: ServicosPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id,companies(service_segment)").eq("id", user.id).maybeSingle()
    : { data: null };
  const company = Array.isArray(profile?.companies) ? profile?.companies[0] : profile?.companies;
  const segment = ((company?.service_segment || "tecnologia") as ServiceSegment);
  const typeOptions = serviceTypeOptions[segment] || serviceTypeOptions.tecnologia;
  const { data: clients } = await supabase
    .from("clients")
    .select("id,legal_name,document,status")
    .eq("status", "ativo")
    .order("legal_name", { ascending: true });
  const { data: services } = await supabase
    .from("service_records")
    .select("id,service_description,service_type,amount,service_date,due_date,status,fiscal_service_data,clients(legal_name,document)")
    .order("service_date", { ascending: false })
    .limit(50);
  const message = params?.status ? statusMessages[params.status] : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        area="Cadastros / Servicos"
        title="Servicos"
        description={`Servicos adaptados para o segmento ${segmentLabels[segment]}.`}
        action={<a className="primary-button button-link" href="/cadastros/clientes">Novo cliente</a>}
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}
      <div className="two-columns">
        <section className="table-panel">
          <h2>Servicos cadastrados</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servico</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Data</th>
                  <th>Detalhes</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {services?.length ? (
                  (services as ServiceRecord[]).map((service) => {
                    const client = getServiceClient(service);
                    return (
                      <tr key={service.id}>
                        <td>{client?.legal_name || "-"}</td>
                        <td>{service.service_description}</td>
                        <td>{service.service_type}</td>
                        <td>{formatMoney(service.amount)}</td>
                        <td>{formatDate(service.service_date)}</td>
                        <td>{getDetailSummary(service) || "-"}</td>
                        <td><span className="badge warning">{service.status}</span></td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7}>Nenhum servico cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        <section className="form-panel">
          <h2>Novo servico</h2>
          <form className="form-stack" action="/api/cadastros/servicos" method="post">
            <label>
              Cliente
              <select name="clientId" required defaultValue="">
                <option value="" disabled>Selecione um cliente</option>
                {clients?.map((client) => (
                  <option key={client.id} value={client.id}>{client.legal_name}</option>
                ))}
              </select>
            </label>
            {!clients?.length ? (
              <div className="form-error">Cadastre um cliente antes de criar o servico.</div>
            ) : null}
            <label>
              Descricao do servico
              <input name="serviceDescription" placeholder="Ex.: Atendimento tecnico avulso" required />
            </label>
            <div className="form-grid">
              <label>
                Tipo
                <select name="serviceType" defaultValue={typeOptions[0]?.value || "avulso"}>
                  {typeOptions.map((option) => (
                    <option value={option.value} key={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Valor
                <input name="amount" inputMode="decimal" placeholder="0,00" required />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Data do servico
                <input name="serviceDate" type="date" defaultValue={today} required />
              </label>
              <label>
                Vencimento
                <input name="dueDate" type="date" />
              </label>
            </div>
            <label>
              Status
              <select name="status" defaultValue="rascunho">
                <option value="rascunho">Rascunho</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluido</option>
                <option value="faturado">Faturado</option>
              </select>
            </label>
            {segment === "tecnologia" ? (
              <fieldset className="checkbox-panel">
                <legend>Dados de tecnologia</legend>
                <div className="form-grid">
                  <label>
                    Atendimento
                    <select name="serviceMode" defaultValue="remoto">
                      <option value="remoto">Remoto</option>
                      <option value="presencial">Presencial</option>
                      <option value="hibrido">Hibrido</option>
                    </select>
                  </label>
                  <label>
                    Prioridade
                    <select name="priority" defaultValue="normal">
                      <option value="baixa">Baixa</option>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="critica">Critica</option>
                    </select>
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Equipamento/ambiente
                    <input name="equipment" placeholder="Servidor, notebook, rede..." />
                  </label>
                  <label>
                    Tecnico responsavel
                    <input name="technician" placeholder="Nome do tecnico" />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Chamado/protocolo
                    <input name="ticketNumber" placeholder="CH-1023" />
                  </label>
                  <label>
                    SLA
                    <input name="sla" placeholder="Ex.: 4h, proximo dia util" />
                  </label>
                </div>
              </fieldset>
            ) : null}
            {segment === "otica" ? (
              <fieldset className="checkbox-panel">
                <legend>Dados de otica</legend>
                <div className="form-grid">
                  <label>
                    Tipo de lente
                    <input name="lensType" placeholder="Simples, multifocal, blue..." />
                  </label>
                  <label>
                    Armacao/modelo
                    <input name="frameModel" placeholder="Marca ou modelo" />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Laboratorio
                    <input name="labName" placeholder="Laboratorio parceiro" />
                  </label>
                  <label>
                    Entrega prevista
                    <input name="deliveryDate" type="date" />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    OD esferico
                    <input name="rightEyeSpherical" placeholder="-1.50" />
                  </label>
                  <label>
                    OE esferico
                    <input name="leftEyeSpherical" placeholder="-1.25" />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    OD cilindrico
                    <input name="rightEyeCylindrical" placeholder="-0.75" />
                  </label>
                  <label>
                    OE cilindrico
                    <input name="leftEyeCylindrical" placeholder="-0.50" />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    OD eixo
                    <input name="rightEyeAxis" placeholder="180" />
                  </label>
                  <label>
                    OE eixo
                    <input name="leftEyeAxis" placeholder="170" />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    Adicao OD
                    <input name="rightEyeAddition" placeholder="+2.00" />
                  </label>
                  <label>
                    Adicao OE
                    <input name="leftEyeAddition" placeholder="+2.00" />
                  </label>
                </div>
                <div className="form-grid">
                  <label>
                    DNP
                    <input name="dnp" placeholder="Ex.: 32/31" />
                  </label>
                </div>
              </fieldset>
            ) : null}
            <label>
              Observacoes
              <textarea name="notes" placeholder="Detalhes internos sobre este atendimento" />
            </label>
            <button className="primary-button" type="submit" disabled={!clients?.length}>Criar servico</button>
          </form>
        </section>
      </div>
    </>
  );
}
