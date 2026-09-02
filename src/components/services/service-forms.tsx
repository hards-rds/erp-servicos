import type { ServiceSegment } from "@/domains/services/catalog";
import { IbsCbsServiceFields } from "@/components/fiscal/ibs-cbs-fields";

export type ServiceFormValue = {
  id: string;
  client_id: string;
  service_description: string;
  service_type: string;
  amount: number | string;
  service_date: string;
  due_date: string | null;
  status: string;
  fiscal_service_data: Record<string, unknown> | null;
  notes: string | null;
  commissions?: Array<{ commission_seller_id: string; due_date: string; status: string }> | null;
};

type ClientOption = { id: string; legal_name: string };
type SellerOption = { id: string; name: string | null; email: string };

function getString(data: Record<string, unknown> | null | undefined, key: string) {
  const value = data?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function getNestedString(data: Record<string, unknown> | null | undefined, parent: string, key: string) {
  const value = data?.[parent];
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const child = (value as Record<string, unknown>)[key];
  return typeof child === "string" ? child : "";
}

export function CatalogServiceForm({ typeOptions }: { typeOptions: { value: string; label: string }[] }) {
  return (
    <form className="form-stack" action="/api/cadastros/catalogo-servicos" method="post">
      <input type="hidden" name="action" value="create" />
      <div className="form-grid">
        <label>Nome<input name="name" placeholder="Ex.: Reforma de armacao" required /></label>
        <label>Codigo<input name="code" placeholder="Codigo interno" /></label>
      </div>
      <label>Descricao<input name="description" placeholder="Descricao apresentada na venda" /></label>
      <div className="form-grid">
        <label>Categoria<input name="category" placeholder="Reparos, exames, suporte..." /></label>
        <label>Tipo<select name="serviceType" defaultValue={typeOptions[0]?.value || "avulso"}>{typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>Preco de venda<input name="salePrice" inputMode="decimal" placeholder="0,00" required /></label>
      </div>
      <fieldset className="checkbox-panel">
        <legend>Servico na NFS-e</legend>
        <div className="form-grid">
          <label>Codigo nacional<input name="serviceCode" inputMode="numeric" maxLength={6} placeholder="Ex.: 010701" /></label>
          <label>Codigo municipal<input name="municipalServiceCode" placeholder="Ex.: 001" /></label>
          <label>Codigo NBS<input name="nbsCode" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} placeholder="Ex.: 123456789" /></label>
        </div>
        <label className="checkbox-row"><input type="checkbox" name="retainIss" /><span>Reter ISSQN nesta operacao</span></label>
        <IbsCbsServiceFields />
      </fieldset>
      <label>Observacoes<textarea name="notes" placeholder="Dados internos do servico" /></label>
      <div className="page-form-actions">
        <a className="ghost-button button-link" href="/cadastros/servicos?view=catalogo">Cancelar</a>
        <button className="primary-button" type="submit">Cadastrar servico</button>
      </div>
    </form>
  );
}

export function ServiceRecordForm({ clients, sellers, segment, typeOptions, service }: {
  clients: ClientOption[];
  sellers: SellerOption[];
  segment: ServiceSegment;
  typeOptions: { value: string; label: string }[];
  service?: ServiceFormValue;
}) {
  const details = service?.fiscal_service_data || {};
  const today = new Date().toISOString().slice(0, 10);
  const commission = service?.commissions?.[0];
  return (
    <form className="form-stack" action="/api/cadastros/servicos" method="post">
      <input type="hidden" name="action" value={service ? "update" : "create"} />
      {service ? <input type="hidden" name="serviceId" value={service.id} /> : null}
      <label>Cliente<select name="clientId" required defaultValue={service?.client_id || ""}><option value="" disabled>Selecione um cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.legal_name}</option>)}</select></label>
      {!clients.length ? <div className="form-error">Cadastre um cliente antes de criar o atendimento.</div> : null}
      <label>Descricao do servico<input name="serviceDescription" defaultValue={service?.service_description || ""} placeholder="Ex.: Atendimento tecnico avulso" required /></label>
      <div className="form-grid">
        <label>Tipo<select name="serviceType" defaultValue={service?.service_type || typeOptions[0]?.value}>{typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label>Valor<input name="amount" inputMode="decimal" defaultValue={service ? String(service.amount).replace(".", ",") : ""} placeholder="0,00" required /></label>
        <label>Data do servico<input name="serviceDate" type="date" defaultValue={service?.service_date || today} required /></label>
        <label>Vencimento<input name="dueDate" type="date" defaultValue={service?.due_date || ""} /></label>
      </div>
      <label>Status<select name="status" defaultValue={service?.status || "rascunho"}><option value="rascunho">Rascunho</option><option value="em_andamento">Em andamento</option><option value="concluido">Concluido</option><option value="faturado">Faturado</option><option value="cancelado">Cancelado</option></select></label>
      <fieldset className="checkbox-panel">
        <legend>Comissao do vendedor</legend>
        <div className="form-grid">
          <label>Vendedor<select name="sellerId" defaultValue={commission?.commission_seller_id || ""}><option value="">Sem comissao</option>{sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name || seller.email}</option>)}</select></label>
          <label>Vencimento da comissao<input name="commissionDueDate" type="date" defaultValue={commission?.due_date || service?.due_date || today} /></label>
        </div>
      </fieldset>
      {segment === "tecnologia" ? (
        <fieldset className="checkbox-panel">
          <legend>Dados de tecnologia</legend>
          <div className="form-grid">
            <label>Atendimento<select name="serviceMode" defaultValue={getString(details, "serviceMode") || "remoto"}><option value="remoto">Remoto</option><option value="presencial">Presencial</option><option value="hibrido">Hibrido</option></select></label>
            <label>Prioridade<select name="priority" defaultValue={getString(details, "priority") || "normal"}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Critica</option></select></label>
            <label>Equipamento/ambiente<input name="equipment" defaultValue={getString(details, "equipment")} placeholder="Servidor, notebook, rede..." /></label>
            <label>Tecnico responsavel<input name="technician" defaultValue={getString(details, "technician")} /></label>
            <label>Chamado/protocolo<input name="ticketNumber" defaultValue={getString(details, "ticketNumber")} /></label>
            <label>SLA<input name="sla" defaultValue={getString(details, "sla")} /></label>
          </div>
        </fieldset>
      ) : null}
      {segment === "otica" ? (
        <fieldset className="checkbox-panel">
          <legend>Dados de otica</legend>
          <div className="form-grid">
            <label>Tipo de lente<input name="lensType" defaultValue={getString(details, "lensType")} /></label>
            <label>Armacao/modelo<input name="frameModel" defaultValue={getString(details, "frameModel")} /></label>
            <label>Laboratorio<input name="labName" defaultValue={getString(details, "labName")} /></label>
            <label>Entrega prevista<input name="deliveryDate" type="date" defaultValue={getString(details, "deliveryDate")} /></label>
            <label>OD esferico<input name="rightEyeSpherical" defaultValue={getNestedString(details, "rightEye", "spherical")} /></label>
            <label>OE esferico<input name="leftEyeSpherical" defaultValue={getNestedString(details, "leftEye", "spherical")} /></label>
            <label>OD cilindrico<input name="rightEyeCylindrical" defaultValue={getNestedString(details, "rightEye", "cylindrical")} /></label>
            <label>OE cilindrico<input name="leftEyeCylindrical" defaultValue={getNestedString(details, "leftEye", "cylindrical")} /></label>
            <label>OD eixo<input name="rightEyeAxis" defaultValue={getNestedString(details, "rightEye", "axis")} /></label>
            <label>OE eixo<input name="leftEyeAxis" defaultValue={getNestedString(details, "leftEye", "axis")} /></label>
            <label>Adicao OD<input name="rightEyeAddition" defaultValue={getNestedString(details, "rightEye", "addition")} /></label>
            <label>Adicao OE<input name="leftEyeAddition" defaultValue={getNestedString(details, "leftEye", "addition")} /></label>
            <label>DNP<input name="dnp" defaultValue={getString(details, "dnp")} /></label>
          </div>
        </fieldset>
      ) : null}
      <fieldset className="checkbox-panel">
        <legend>Servico na NFS-e</legend>
        <div className="form-grid">
          <label>Codigo nacional<input name="serviceCode" inputMode="numeric" maxLength={6} defaultValue={getString(details, "serviceCode")} /></label>
          <label>Codigo municipal<input name="municipalServiceCode" defaultValue={getString(details, "municipalServiceCode")} /></label>
          <label>Codigo NBS<input name="nbsCode" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} defaultValue={getString(details, "nbsCode")} /></label>
        </div>
        <label className="checkbox-row"><input type="checkbox" name="retainIss" defaultChecked={details.retainIss === true} /><span>Reter ISSQN nesta operacao</span></label>
        <IbsCbsServiceFields data={details} />
      </fieldset>
      <label>Observacoes<textarea name="notes" defaultValue={service?.notes || ""} placeholder="Detalhes internos sobre este atendimento" /></label>
      <div className="page-form-actions">
        <a className="ghost-button button-link" href="/cadastros/servicos?view=atendimentos">Cancelar</a>
        <button className="primary-button" type="submit" disabled={!clients.length}>{service ? "Salvar evolucao" : "Criar atendimento"}</button>
      </div>
    </form>
  );
}
