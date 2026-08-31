import Link from "next/link";
import { Pencil, ReceiptText } from "lucide-react";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";

export function ContractorActions({ id, name }: { id: string; name: string }) {
  return (
    <RowActionsMenu label={`Acoes do prestador ${name}`}>
      <Link className="ghost-button button-link compact-button button-with-icon" href={`/pessoas/colaboradores/${id}/editar`}>
        <Pencil aria-hidden="true" size={16} />
        Editar
      </Link>
      <Link className="ghost-button button-link compact-button button-with-icon" href="/pessoas/fechamentos">
        <ReceiptText aria-hidden="true" size={16} />
        Fechamentos
      </Link>
    </RowActionsMenu>
  );
}
