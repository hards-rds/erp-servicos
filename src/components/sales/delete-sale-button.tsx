"use client";

import { Trash2 } from "lucide-react";

type DeleteSaleButtonProps = {
  saleId: string;
  description: string;
};

export function DeleteSaleButton({ saleId, description }: DeleteSaleButtonProps) {
  return (
    <form
      action="/api/operacao/vendas"
      method="post"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Excluir permanentemente a venda "${description}"? O financeiro e a comissao vinculados serao removidos e os produtos retornarao ao estoque. Esta acao nao pode ser desfeita.`
        );
        if (!confirmed) event.preventDefault();
      }}
    >
      <input type="hidden" name="action" value="delete" />
      <input type="hidden" name="saleId" value={saleId} />
      <button className="danger-button compact-button button-with-icon" type="submit">
        <Trash2 aria-hidden="true" size={16} />
        Excluir venda
      </button>
    </form>
  );
}
