"use client";

import { Pencil, X } from "lucide-react";
import { useRef } from "react";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

type ServiceTypeOption = { value: string; label: string };

export function CatalogServiceActions({
  service,
  typeOptions
}: {
  service: {
    id: string;
    code: string | null;
    name: string;
    description: string | null;
    category: string | null;
    serviceType: string;
    salePrice: number | string;
    fiscalServiceData: Record<string, unknown> | null;
    notes: string | null;
    active: boolean;
  };
  typeOptions: ServiceTypeOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fiscalValue = (key: string) => {
    const value = service.fiscalServiceData?.[key];
    return typeof value === "string" ? value : "";
  };

  return (
    <RowActionsMenu label={`Acoes do servico ${service.name}`}>
      <button className="ghost-button compact-button button-with-icon" type="button" onClick={() => dialogRef.current?.showModal()}>
        <Pencil aria-hidden="true" size={16} />
        Editar
      </button>
      <form action="/api/cadastros/catalogo-servicos" method="post">
        <input type="hidden" name="action" value="toggle" />
        <input type="hidden" name="catalogServiceId" value={service.id} />
        <input type="hidden" name="active" value={service.active ? "false" : "true"} />
        <button className="ghost-button compact-button" type="submit">{service.active ? "Desativar" : "Ativar"}</button>
      </form>
      <dialog className="action-dialog" ref={dialogRef} aria-labelledby={`edit-catalog-service-${service.id}`}>
        <div className="dialog-header">
          <div>
            <h2 id={`edit-catalog-service-${service.id}`}>Editar servico</h2>
            <p className="dialog-description">{service.name}</p>
          </div>
          <button className="icon-button" type="button" title="Fechar" aria-label="Fechar" onClick={() => dialogRef.current?.close()}>
            <X aria-hidden="true" />
          </button>
        </div>
        <form className="form-stack" action="/api/cadastros/catalogo-servicos" method="post">
          <input type="hidden" name="action" value="update" />
          <input type="hidden" name="catalogServiceId" value={service.id} />
          <div className="form-grid">
            <label>Nome<input name="name" defaultValue={service.name} required /></label>
            <label>Codigo<input name="code" defaultValue={service.code || ""} /></label>
          </div>
          <label>Descricao<input name="description" defaultValue={service.description || ""} /></label>
          <div className="form-grid">
            <label>Categoria<input name="category" defaultValue={service.category || ""} /></label>
            <label>
              Tipo
              <select name="serviceType" defaultValue={service.serviceType}>
                {typeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <label>Preco de venda<input name="salePrice" inputMode="decimal" defaultValue={String(service.salePrice).replace(".", ",")} required /></label>
          <fieldset className="checkbox-panel">
            <legend>Servico na NFS-e</legend>
            <div className="form-grid">
              <label>Codigo nacional<input name="serviceCode" inputMode="numeric" maxLength={6} defaultValue={fiscalValue("serviceCode")} /></label>
              <label>Codigo municipal<input name="municipalServiceCode" defaultValue={fiscalValue("municipalServiceCode")} /></label>
              <label>Codigo NBS<input name="nbsCode" inputMode="numeric" pattern="[0-9]{9}" maxLength={9} defaultValue={fiscalValue("nbsCode")} /></label>
            </div>
            <label className="checkbox-row"><input type="checkbox" name="retainIss" defaultChecked={service.fiscalServiceData?.retainIss === true} /><span>Reter ISSQN nesta operacao</span></label>
          </fieldset>
          <label>Observacoes<textarea name="notes" defaultValue={service.notes || ""} /></label>
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>Voltar</button>
            <button className="primary-button" type="submit">Salvar alteracoes</button>
          </div>
        </form>
      </dialog>
    </RowActionsMenu>
  );
}
