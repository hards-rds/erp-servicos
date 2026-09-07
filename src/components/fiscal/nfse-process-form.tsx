"use client";

type NfseProcessFormProps = {
  documentId: string;
  realProduction: boolean;
};

export function NfseProcessForm({ documentId, realProduction }: NfseProcessFormProps) {
  return (
    <form
      className="nfse-emission-form"
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
      {realProduction ? (
        <label className="checkbox-row">
          <input type="checkbox" name="issueCharge" value="true" />
          <span>Deseja emitir o boleto do Banco Inter e enviar os dois PDFs ao e-mail fiscal?</span>
        </label>
      ) : null}
      <button className="primary-button compact-button" type="submit">
        {realProduction ? "Confirmar e emitir NFS-e" : "Validar NFS-e"}
      </button>
    </form>
  );
}
