import { isValidCnpj, onlyDigits } from "../validations/br-documents.ts";

type BrasilApiCnpj = {
  cnpj: string;
  razao_social?: string;
  nome_fantasia?: string;
  ddd_telefone_1?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  codigo_municipio_ibge?: number | string;
  uf?: string;
  cep?: string;
  descricao_tipo_de_logradouro?: string;
  descricao_situacao_cadastral?: string;
};

export type CnpjRegistration = {
  document: string;
  legalName: string;
  tradeName: string;
  phone: string;
  fiscalEmail: string;
  financialEmail: string;
  registrationStatus: string;
  address: {
    street: string;
    number: string;
    complement: string;
    district: string;
    city: string;
    cityCode: string;
    state: string;
    zipCode: string;
  };
};

export type ClientRegistrationFields = {
  legal_name: string;
  trade_name: string | null;
  fiscal_email: string | null;
  financial_email: string | null;
  phone: string | null;
  address: Record<string, unknown> | null;
};

export async function lookupCnpjRegistration(
  documentInput: string,
  fetcher: typeof fetch = fetch
): Promise<CnpjRegistration> {
  const document = onlyDigits(documentInput);
  if (document.length !== 14 || !isValidCnpj(document)) {
    throw new Error("CNPJ invalido.");
  }

  const response = await fetcher(`https://brasilapi.com.br/api/cnpj/v1/${document}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "User-Agent": "erp-servicos/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`Consulta de CNPJ indisponivel (${response.status}).`);
  }

  const data = (await response.json()) as BrasilApiCnpj;
  const legalName = String(data.razao_social || "").trim();
  if (!legalName) throw new Error("A consulta do CNPJ nao retornou a razao social.");
  const streetType = String(data.descricao_tipo_de_logradouro || "").trim();
  const streetName = String(data.logradouro || "").trim();
  const street = streetType && streetName && !streetName.toLocaleUpperCase("pt-BR").startsWith(`${streetType.toLocaleUpperCase("pt-BR")} `)
    ? `${streetType} ${streetName}`.trim()
    : streetName;

  return {
    document,
    legalName,
    tradeName: String(data.nome_fantasia || "").trim(),
    phone: String(data.ddd_telefone_1 || "").trim(),
    fiscalEmail: String(data.email || "").trim(),
    financialEmail: String(data.email || "").trim(),
    registrationStatus: String(data.descricao_situacao_cadastral || "").trim(),
    address: {
      street,
      number: String(data.numero || "").trim(),
      complement: String(data.complemento || "").trim(),
      district: String(data.bairro || "").trim(),
      city: String(data.municipio || "").trim(),
      cityCode: String(data.codigo_municipio_ibge || "").trim(),
      state: String(data.uf || "").trim(),
      zipCode: String(data.cep || "").trim()
    }
  };
}

function comparableName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

export function registrationChangesClientName(currentLegalName: string, registrationLegalName: string) {
  return comparableName(currentLegalName) !== comparableName(registrationLegalName);
}

function addressValue(address: Record<string, unknown> | null, key: string) {
  return String(address?.[key] || "").trim();
}

export function mergeClientRegistration(
  current: ClientRegistrationFields,
  registration: CnpjRegistration
): ClientRegistrationFields {
  const nameChanged = registrationChangesClientName(current.legal_name, registration.legalName);
  const currentAddress = current.address || {};
  const address = Object.fromEntries(
    Object.entries(registration.address).map(([key, value]) => [key, value || addressValue(currentAddress, key)])
  );

  return {
    legal_name: registration.legalName,
    trade_name: registration.tradeName || current.trade_name || (nameChanged ? current.legal_name : null),
    fiscal_email: current.fiscal_email || registration.fiscalEmail || null,
    financial_email: current.financial_email || registration.financialEmail || null,
    phone: current.phone || registration.phone || null,
    address
  };
}
