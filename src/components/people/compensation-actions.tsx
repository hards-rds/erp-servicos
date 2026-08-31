"use client";

import { Ban, CheckCircle2, Eye } from "lucide-react";
import Link from "next/link";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

export function CompensationActions({ id, status }: { id: string; status: string }) {
  return (
    <RowActionsMenu label="Acoes do fechamento PJ">
      <Link className="ghost-button button-link compact-button button-with-icon" href={`/pessoas/fechamentos/${id}`}>
        <Eye aria-hidden="true" size={16} />
        Conferir detalhes
      </Link>
      {status === "rascunho" ? (
        <form action="/api/pessoas/colaboradores" method="post" onSubmit={(event) => {
          if (!window.confirm("Aprovar este fechamento e gerar a conta a pagar?")) event.preventDefault();
        }}>
          <input type="hidden" name="action" value="approve" />
          <input type="hidden" name="compensationId" value={id} />
          <button className="primary-button compact-button button-with-icon" type="submit">
            <CheckCircle2 aria-hidden="true" size={16} />
            Aprovar e gerar saida
          </button>
        </form>
      ) : null}
      {["rascunho", "aprovado"].includes(status) ? (
        <form action="/api/pessoas/colaboradores" method="post" onSubmit={(event) => {
          if (!window.confirm("Cancelar este fechamento? A conta a pagar em aberto tambem sera cancelada.")) event.preventDefault();
        }}>
          <input type="hidden" name="action" value="cancel" />
          <input type="hidden" name="compensationId" value={id} />
          <button className="danger-button compact-button button-with-icon" type="submit">
            <Ban aria-hidden="true" size={16} />
            Cancelar
          </button>
        </form>
      ) : null}
    </RowActionsMenu>
  );
}
