"use client";

import { useState } from "react";
import { Search } from "lucide-react";

type LookupState = "idle" | "loading" | "success" | "error";

type LookupResponse = {
  type: "cpf" | "cnpj";
  message?: string;
  legalName?: string;
  tradeName?: string;
  phone?: string;
  fiscalEmail?: string;
  financialEmail?: string;
  address?: {
    street?: string;
    number?: string;
    complement?: string;
    district?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  error?: string;
};

export function ClientForm() {
  const [document, setDocument] = useState("");
  const [lookupState, setLookupState] = useState<LookupState>("idle");
  const [lookupMessage, setLookupMessage] = useState("");
  const [fields, setFields] = useState({
    legalName: "",
    tradeName: "",
    phone: "",
    fiscalEmail: "",
    financialEmail: "",
    street: "",
    number: "",
    complement: "",
    district: "",
    city: "",
    state: "",
    zipCode: ""
  });

  async function lookupDocument() {
    setLookupState("loading");
    setLookupMessage("");

    const response = await fetch(`/api/cadastros/documento?document=${encodeURIComponent(document)}`);
    const data = (await response.json()) as LookupResponse;

    if (!response.ok) {
      setLookupState("error");
      setLookupMessage(data.error || "Nao foi possivel consultar o documento.");
      return;
    }

    setLookupState("success");
    setLookupMessage(data.message || "Dados encontrados e preenchidos.");
    setFields((current) => ({
      ...current,
      legalName: data.legalName || current.legalName,
      tradeName: data.tradeName || current.tradeName,
      phone: data.phone || current.phone,
      fiscalEmail: data.fiscalEmail || current.fiscalEmail,
      financialEmail: data.financialEmail || current.financialEmail,
      street: data.address?.street || current.street,
      number: data.address?.number || current.number,
      complement: data.address?.complement || current.complement,
      district: data.address?.district || current.district,
      city: data.address?.city || current.city,
      state: data.address?.state || current.state,
      zipCode: data.address?.zipCode || current.zipCode
    }));
  }

  return (
    <form className="form-stack" action="/api/cadastros/clientes" method="post">
      <label>
        CPF/CNPJ
        <div className="inline-control">
          <input
            name="document"
            value={document}
            onChange={(event) => setDocument(event.target.value)}
            placeholder="CPF ou CNPJ"
            required
          />
          <button
            className="icon-button"
            type="button"
            onClick={lookupDocument}
            disabled={lookupState === "loading"}
            title="Buscar dados"
            aria-label="Buscar dados por CPF ou CNPJ"
          >
            <Search aria-hidden="true" />
          </button>
        </div>
      </label>
      {lookupMessage ? (
        <div className={lookupState === "error" ? "form-error" : "form-success"}>{lookupMessage}</div>
      ) : null}
      <label>
        Nome/Razao social
        <input
          name="legalName"
          value={fields.legalName}
          onChange={(event) => setFields({ ...fields, legalName: event.target.value })}
          placeholder="Nome completo ou razao social"
          required
        />
      </label>
      <label>
        Nome fantasia
        <input
          name="tradeName"
          value={fields.tradeName}
          onChange={(event) => setFields({ ...fields, tradeName: event.target.value })}
          placeholder="Nome comercial"
        />
      </label>
      <div className="form-grid">
        <label>
          E-mail fiscal
          <input
            name="fiscalEmail"
            type="email"
            value={fields.fiscalEmail}
            onChange={(event) => setFields({ ...fields, fiscalEmail: event.target.value })}
            placeholder="fiscal@cliente.com"
          />
        </label>
        <label>
          E-mail financeiro
          <input
            name="financialEmail"
            type="email"
            value={fields.financialEmail}
            onChange={(event) => setFields({ ...fields, financialEmail: event.target.value })}
            placeholder="financeiro@cliente.com"
          />
        </label>
      </div>
      <label>
        Telefone
        <input
          name="phone"
          value={fields.phone}
          onChange={(event) => setFields({ ...fields, phone: event.target.value })}
          placeholder="(00) 00000-0000"
        />
      </label>
      <div className="form-grid">
        <label>
          Inscricao municipal
          <input name="municipalRegistration" placeholder="Inscricao municipal" />
        </label>
        <label>
          Inscricao estadual
          <input name="stateRegistration" placeholder="Inscricao estadual" />
        </label>
      </div>
      <div className="form-grid">
        <label>
          CEP
          <input
            name="zipCode"
            value={fields.zipCode}
            onChange={(event) => setFields({ ...fields, zipCode: event.target.value })}
            placeholder="00000-000"
          />
        </label>
        <label>
          UF
          <input
            name="state"
            value={fields.state}
            onChange={(event) => setFields({ ...fields, state: event.target.value })}
            placeholder="SP"
            maxLength={2}
          />
        </label>
      </div>
      <label>
        Logradouro
        <input
          name="street"
          value={fields.street}
          onChange={(event) => setFields({ ...fields, street: event.target.value })}
          placeholder="Rua, avenida..."
        />
      </label>
      <div className="form-grid">
        <label>
          Numero
          <input
            name="number"
            value={fields.number}
            onChange={(event) => setFields({ ...fields, number: event.target.value })}
            placeholder="Numero"
          />
        </label>
        <label>
          Complemento
          <input
            name="complement"
            value={fields.complement}
            onChange={(event) => setFields({ ...fields, complement: event.target.value })}
            placeholder="Sala, bloco..."
          />
        </label>
      </div>
      <div className="form-grid">
        <label>
          Bairro
          <input
            name="district"
            value={fields.district}
            onChange={(event) => setFields({ ...fields, district: event.target.value })}
            placeholder="Bairro"
          />
        </label>
        <label>
          Cidade
          <input
            name="city"
            value={fields.city}
            onChange={(event) => setFields({ ...fields, city: event.target.value })}
            placeholder="Cidade"
          />
        </label>
      </div>
      <label>
        Observacoes
        <textarea name="internalNotes" placeholder="Observacoes internas" />
      </label>
      <button className="primary-button" type="submit">Criar cliente</button>
    </form>
  );
}
