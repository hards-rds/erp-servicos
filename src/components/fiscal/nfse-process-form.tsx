"use client";

type NfseProcessFormProps = {
  documentId: string;
  realProduction: boolean;
};

export function NfseProcessForm({ documentId, realProduction }: NfseProcessFormProps) {
  return (
    <form
      action="/api/fiscal/nfse/emitir"
      method="post"
      onSubmit={(event) => {
        if (realProduction && !window.confirm("Confirmar a emissao real desta NFS-e em producao?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="nfseDocumentId" value={documentId} />
      {realProduction ? <input type="hidden" name="productionConfirmed" value="true" /> : null}
      <button className="ghost-button compact-button" type="submit">
        {realProduction ? "Emitir" : "Processar"}
      </button>
    </form>
  );
}
