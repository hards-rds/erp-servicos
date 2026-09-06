"use client";

import { useMemo, useState } from "react";

export type CommissionClientOption = { id: string; label: string };

function searchKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[./-]/g, "");
}

export function CommissionClientSelector({ clients, initialClientIds }: {
  clients: CommissionClientOption[];
  initialClientIds?: string[] | null;
}) {
  const [scope, setScope] = useState(initialClientIds == null ? "all" : "selected");
  const [selected, setSelected] = useState(initialClientIds || []);
  const [query, setQuery] = useState("");
  const visible = useMemo(() => clients.filter((client) => searchKey(client.label).includes(searchKey(query))), [clients, query]);

  return (
    <div className="form-stack contractor-client-selector">
      <label>
        Participacao por cliente
        <select name="commissionClientScope" value={scope} onChange={(event) => setScope(event.target.value)}>
          <option value="all">Todos os clientes</option>
          <option value="selected">Clientes selecionados</option>
        </select>
      </label>
      {scope === "selected" ? (
        <>
          {selected.map((id) => <input key={id} type="hidden" name="commissionClientIds" value={id} />)}
          <label>
            Buscar cliente
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nome ou CPF/CNPJ" />
          </label>
          <div className="batch-toolbar">
            <span aria-live="polite">{selected.length} cliente(s) selecionado(s)</span>
            <button className="ghost-button compact-button" type="button" disabled={!visible.length}
              onClick={() => setSelected((current) => [...new Set([...current, ...visible.map((client) => client.id)])])}>Selecionar resultados</button>
            <button className="ghost-button compact-button" type="button" disabled={!selected.length} onClick={() => setSelected([])}>Limpar selecao</button>
          </div>
          <div className="contractor-client-options" role="group" aria-label="Clientes participantes da comissao">
            {visible.map((client) => (
              <label className="checkbox-row" key={client.id}>
                <input type="checkbox" checked={selected.includes(client.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, client.id] : current.filter((id) => id !== client.id))} />
                <span>{client.label}</span>
              </label>
            ))}
            {!visible.length ? <span>Nenhum cliente encontrado.</span> : null}
          </div>
          {!selected.length ? <p className="form-error" role="alert">Selecione pelo menos um cliente.</p> : null}
        </>
      ) : null}
    </div>
  );
}
