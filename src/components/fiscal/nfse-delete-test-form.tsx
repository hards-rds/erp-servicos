"use client";

export function NfseDeleteTestForm({ documentId }: { documentId: string }) {
  return (
    <form
      action="/api/fiscal/nfse/excluir-teste"
      method="post"
      onSubmit={(event) => {
        if (!window.confirm("Excluir este documento de teste e o lancamento financeiro vinculado?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="nfseDocumentId" value={documentId} />
      <button className="danger-button compact-button" type="submit">Excluir teste</button>
    </form>
  );
}

