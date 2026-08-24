"use client";

import { Pencil, X } from "lucide-react";
import { useRef } from "react";

type TenantActionsProps = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    status: string;
  };
  company: {
    id: string;
    name: string;
    document: string | null;
    serviceSegment: string | null;
    active: boolean;
  };
  master: {
    id: string;
    name: string | null;
    email: string;
  } | null;
};

export function TenantActions({ tenant, company, master }: TenantActionsProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="ghost-button compact-button button-with-icon"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Pencil aria-hidden="true" size={16} />
        Editar {company.name}
      </button>
      <dialog className="action-dialog tenant-dialog" ref={dialogRef} aria-labelledby={`edit-tenant-${tenant.id}`}>
        <div className="dialog-header">
          <div>
            <h2 id={`edit-tenant-${tenant.id}`}>Editar tenant</h2>
            <p className="dialog-description">{tenant.slug}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            title="Fechar"
            aria-label="Fechar"
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <form className="form-stack" action="/api/admin/tenants" method="post">
          <input type="hidden" name="action" value="update" />
          <input type="hidden" name="tenantId" value={tenant.id} />
          <input type="hidden" name="companyId" value={company.id} />
          <input type="hidden" name="masterUserId" value={master?.id || ""} />
          <div className="form-grid">
            <label>
              Nome do tenant
              <input name="tenantName" defaultValue={tenant.name} required />
            </label>
            <label>
              Plano
              <select name="plan" defaultValue={tenant.plan}>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Status do tenant
              <select name="tenantStatus" defaultValue={tenant.status}>
                <option value="active">Ativo</option>
                <option value="trial">Em teste</option>
                <option value="suspended">Suspenso</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </label>
            <label>
              Segmento
              <select name="serviceSegment" defaultValue={company.serviceSegment || "generico"}>
                <option value="tecnologia">Tecnologia</option>
                <option value="otica">Otica</option>
                <option value="escola_futebol">Escola de futebol</option>
                <option value="generico">Generico</option>
              </select>
            </label>
          </div>
          <div className="form-grid">
            <label>
              Nome da empresa
              <input name="companyName" defaultValue={company.name} required />
            </label>
            <label>
              CNPJ/CPF da empresa
              <input name="companyDocument" inputMode="numeric" defaultValue={company.document || ""} />
            </label>
          </div>
          {master ? (
            <div className="form-grid">
              <label>
                Nome do master
                <input name="masterName" defaultValue={master.name || ""} required />
              </label>
              <label>
                E-mail do master
                <input value={master.email} readOnly aria-readonly="true" />
              </label>
            </div>
          ) : null}
          <label className="checkbox-row">
            <input name="companyActive" type="checkbox" value="true" defaultChecked={company.active} />
            <span>Empresa ativa</span>
          </label>
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>Voltar</button>
            <button className="primary-button" type="submit">Salvar alteracoes</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
