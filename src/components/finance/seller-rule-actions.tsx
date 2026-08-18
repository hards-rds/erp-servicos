"use client";

import { Pencil, X } from "lucide-react";
import { useRef } from "react";
import { SellerRuleForm } from "@/components/finance/seller-rule-form";

type Option = { id: string; name: string };
type ServiceOption = { value: string; label: string };

export function SellerRuleActions({
  rule,
  sellers,
  products,
  serviceTypes
}: {
  rule: {
    id: string;
    sellerId: string;
    sourceType: "venda" | "servico";
    productId: string | null;
    serviceType: string | null;
    ratePercent: number | string;
  };
  sellers: Option[];
  products: Option[];
  serviceTypes: ServiceOption[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <div className="table-actions">
      <button className="ghost-button compact-button button-with-icon" type="button" onClick={() => dialogRef.current?.showModal()}>
        <Pencil aria-hidden="true" size={16} />
        Editar
      </button>
      <form action="/api/financeiro/vendedores" method="post">
        <input type="hidden" name="action" value="delete_rule" />
        <input type="hidden" name="ruleId" value={rule.id} />
        <button className="ghost-button compact-button" type="submit">Excluir</button>
      </form>
      <dialog className="action-dialog" ref={dialogRef} aria-labelledby={`edit-rule-${rule.id}`}>
        <div className="dialog-header">
          <div>
            <h2 id={`edit-rule-${rule.id}`}>Editar percentual</h2>
            <p className="dialog-description">A nova taxa sera aplicada aos proximos lancamentos.</p>
          </div>
          <button className="icon-button" type="button" title="Fechar" aria-label="Fechar" onClick={() => dialogRef.current?.close()}>
            <X aria-hidden="true" />
          </button>
        </div>
        <SellerRuleForm sellers={sellers} products={products} serviceTypes={serviceTypes} rule={rule} />
      </dialog>
    </div>
  );
}
