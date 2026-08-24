"use client";

import { Pencil, X } from "lucide-react";
import { useRef } from "react";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

type ProfileOption = { id: string; name: string };

export function SellerActions({
  seller,
  profiles
}: {
  seller: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    notes: string | null;
    profileId: string | null;
    active: boolean;
  };
  profiles: ProfileOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <RowActionsMenu label={`Acoes do vendedor ${seller.name}`}>
      <button
        className="ghost-button compact-button button-with-icon"
        type="button"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Pencil aria-hidden="true" size={16} />
        Editar
      </button>
      <form action="/api/financeiro/vendedores" method="post">
        <input type="hidden" name="action" value="toggle_seller" />
        <input type="hidden" name="sellerId" value={seller.id} />
        <input type="hidden" name="active" value={seller.active ? "false" : "true"} />
        <button className="ghost-button compact-button" type="submit">{seller.active ? "Desativar" : "Ativar"}</button>
      </form>
      <dialog className="action-dialog" ref={dialogRef} aria-labelledby={`edit-seller-${seller.id}`}>
        <div className="dialog-header">
          <div>
            <h2 id={`edit-seller-${seller.id}`}>Editar vendedor</h2>
            <p className="dialog-description">{seller.name}</p>
          </div>
          <button className="icon-button" type="button" title="Fechar" aria-label="Fechar" onClick={() => dialogRef.current?.close()}>
            <X aria-hidden="true" />
          </button>
        </div>
        <form className="form-stack" action="/api/financeiro/vendedores" method="post">
          <input type="hidden" name="action" value="update_seller" />
          <input type="hidden" name="sellerId" value={seller.id} />
          <label>Nome<input name="name" defaultValue={seller.name} required /></label>
          <div className="form-grid">
            <label>E-mail<input name="email" type="email" defaultValue={seller.email || ""} /></label>
            <label>Telefone<input name="phone" defaultValue={seller.phone || ""} /></label>
          </div>
          <label>
            Usuario vinculado
            <select name="profileId" defaultValue={seller.profileId || ""}>
              <option value="">Sem acesso ao sistema</option>
              {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
            </select>
          </label>
          <label>Observacoes<textarea name="notes" defaultValue={seller.notes || ""} /></label>
          <div className="dialog-actions">
            <button className="ghost-button" type="button" onClick={() => dialogRef.current?.close()}>Voltar</button>
            <button className="primary-button" type="submit">Salvar alteracoes</button>
          </div>
        </form>
      </dialog>
    </RowActionsMenu>
  );
}
