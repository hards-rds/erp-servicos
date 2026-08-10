type Row = Record<string, unknown>;

export type NfseNationalInput = {
  documentId: string;
  company: {
    name: string;
    document: string | null;
  };
  client: {
    legal_name: string;
    document: string;
    fiscal_email: string | null;
    phone: string | null;
    address: Row | null;
  };
  entry: {
    id: string;
    description: string;
    competence: string;
    net_amount: number | string;
  };
  fiscalData: Row | null;
};

export type NfseProviderResult = {
  ok: boolean;
  status: "autorizada" | "enfileirada" | "rejeitada" | "erro_integracao";
  provider: string;
  message: string;
  protocol?: string;
  externalId?: string;
  verificationCode?: string;
  requestPayload?: Row;
  responsePayload?: Row;
};

const HOMOLOGATION_HOST = "sefin.producaorestrita.nfse.gov.br";
const PRODUCTION_HOST = "sefin.nfse.gov.br";

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function onlyDigits(value: unknown) {
  return clean(value).replace(/\D/g, "");
}

function xml(value: unknown) {
  return clean(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function decimal(value: unknown, precision = 2) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toFixed(precision) : (0).toFixed(precision);
}

function addressValue(address: Row | null, key: string) {
  const value = address?.[key];
  return typeof value === "string" ? value : "";
}

function fiscalValue(fiscalData: Row | null, key: string) {
  const value = fiscalData?.[key];
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : "";
}

function row(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

export function mergeNfseFiscalData(documentData: unknown, contractData: unknown) {
  return {
    ...row(documentData),
    ...row(contractData)
  };
}

function dpsNumber(seed: string) {
  let value = 0n;
  for (const char of seed) {
    value = (value * 31n + BigInt(char.charCodeAt(0))) % 999999999999999n;
  }
  return (value + 1n).toString();
}

function emissionDateTime() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(new Date()).replace(" ", "T");
  return `${parts}-03:00`;
}

export function normalizeNfseNacionalEndpoint(value: unknown) {
  const raw = clean(value).replace(/\/$/, "");
  if (!raw) return "";

  try {
    const target = new URL(raw);
    if (target.hostname === HOMOLOGATION_HOST) {
      target.pathname = target.pathname.replace(/^\/API\/SefinNacional(?=\/|$)/i, "/SefinNacional");
    }
    return target.toString().replace(/\/$/, "");
  } catch {
    return raw;
  }
}

export function validateNfseEnvironment(environment: string, endpoint: string) {
  if (!endpoint) return "Endpoint da NFS-e Nacional nao configurado.";

  let hostname = "";
  try {
    const target = new URL(endpoint);
    if (target.protocol !== "https:") return "Endpoint da NFS-e Nacional deve usar HTTPS.";
    hostname = target.hostname.toLowerCase();
  } catch {
    return "Endpoint da NFS-e Nacional invalido.";
  }

  if (environment !== "production" && hostname !== HOMOLOGATION_HOST) {
    return "Em homologacao, use o endpoint oficial de producao restrita da NFS-e Nacional.";
  }

  if (environment === "production" && hostname !== PRODUCTION_HOST) {
    return "Em producao, use o endpoint oficial de producao da NFS-e Nacional.";
  }

  if (environment === "production" && process.env.NFSE_PRODUCTION_ENABLED !== "true") {
    return "Emissao em producao bloqueada. Libere NFSE_PRODUCTION_ENABLED somente apos homologacao.";
  }

  return "";
}

export function buildDpsXml(input: NfseNationalInput) {
  const fiscalData = input.fiscalData || {};
  const environment = clean(fiscalValue(fiscalData, "environment")) || process.env.NFSE_ENV || "homologation";
  const series = clean(fiscalValue(fiscalData, "series")) || "1";
  const layoutVersion = "1.01";
  const cityCode = onlyDigits(fiscalValue(fiscalData, "cityCode"));
  const serviceCode = onlyDigits(fiscalValue(fiscalData, "serviceCode")).slice(0, 6);
  const municipalServiceCode = onlyDigits(fiscalValue(fiscalData, "municipalServiceCode")).slice(-3);
  const companyDocument = onlyDigits(input.company.document);
  const clientDocument = onlyDigits(input.client.document);
  const clientDocumentTag = clientDocument.length === 11 ? "CPF" : "CNPJ";
  const municipalRegistration = onlyDigits(fiscalValue(fiscalData, "municipalRegistration"));
  const number = dpsNumber(`${input.documentId}:${input.entry.id}:${input.entry.competence}`);
  const serieId = series.padStart(5, "0");
  const numeroId = number.padStart(15, "0");
  const dpsId = `DPS${cityCode}2${companyDocument}${serieId}${numeroId}`;
  const address = input.client.address || {};
  const zipCode = onlyDigits(addressValue(address, "zipCode"));

  return {
    id: dpsId,
    number,
    series,
    cityCode,
    serviceCode,
    environment,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="${xml(layoutVersion)}">
  <infDPS Id="${xml(dpsId)}">
    <tpAmb>${environment === "production" ? "1" : "2"}</tpAmb>
    <dhEmi>${xml(emissionDateTime())}</dhEmi>
    <verAplic>erp-servicos-1.0</verAplic>
    <serie>${xml(series)}</serie>
    <nDPS>${xml(number)}</nDPS>
    <dCompet>${xml(`${input.entry.competence}-01`)}</dCompet>
    <tpEmit>1</tpEmit>
    <cLocEmi>${xml(cityCode)}</cLocEmi>
    <prest>
      <CNPJ>${xml(companyDocument)}</CNPJ>
      ${municipalRegistration ? `<IM>${xml(municipalRegistration)}</IM>` : ""}
      <regTrib>
        <opSimpNac>${fiscalValue(fiscalData, "simpleNational") === true ? "3" : "1"}</opSimpNac>
        <regEspTrib>0</regEspTrib>
      </regTrib>
    </prest>
    <toma>
      <${clientDocumentTag}>${xml(clientDocument)}</${clientDocumentTag}>
      <xNome>${xml(input.client.legal_name)}</xNome>
      ${cityCode && zipCode ? `<end>
        <endNac>
          <cMun>${xml(cityCode)}</cMun>
          <CEP>${xml(zipCode)}</CEP>
        </endNac>
        <xLgr>${xml(addressValue(address, "street") || "NAO INFORMADO")}</xLgr>
        <nro>${xml(addressValue(address, "number") || "S/N")}</nro>
        ${addressValue(address, "complement") ? `<xCpl>${xml(addressValue(address, "complement"))}</xCpl>` : ""}
        ${addressValue(address, "district") ? `<xBairro>${xml(addressValue(address, "district"))}</xBairro>` : ""}
      </end>` : ""}
      ${onlyDigits(input.client.phone) ? `<fone>${xml(onlyDigits(input.client.phone))}</fone>` : ""}
      ${input.client.fiscal_email ? `<email>${xml(input.client.fiscal_email)}</email>` : ""}
    </toma>
    <serv>
      <locPrest>
        <cLocPrestacao>${xml(cityCode)}</cLocPrestacao>
      </locPrest>
      <cServ>
        <cTribNac>${xml(serviceCode)}</cTribNac>
        ${municipalServiceCode ? `<cTribMun>${xml(municipalServiceCode)}</cTribMun>` : ""}
        <xDescServ>${xml(input.entry.description)}</xDescServ>
      </cServ>
    </serv>
    <valores>
      <vServPrest>
        <vServ>${decimal(input.entry.net_amount)}</vServ>
      </vServPrest>
      <trib>
        <tribMun>
          <tribISSQN>1</tribISSQN>
          <tpRetISSQN>${fiscalValue(fiscalData, "retainIss") === true ? "2" : "1"}</tpRetISSQN>
        </tribMun>
        <totTrib>
          <indTotTrib>0</indTotTrib>
        </totTrib>
      </trib>
    </valores>
  </infDPS>
</DPS>`
  };
}

export function validateDpsInput(input: NfseNationalInput) {
  const dps = buildDpsXml(input);
  const errors: string[] = [];

  if (onlyDigits(input.company.document).length !== 14) errors.push("CNPJ do emitente obrigatorio em Configuracoes Gerais.");
  if (![11, 14].includes(onlyDigits(input.client.document).length)) errors.push("CPF/CNPJ do tomador invalido.");
  if (dps.cityCode.length !== 7) errors.push("Codigo IBGE do municipio de incidencia obrigatorio.");
  if (dps.serviceCode.length !== 6) errors.push("Codigo nacional de servico NFS-e obrigatorio com 6 digitos.");
  if (Number(input.entry.net_amount) <= 0) errors.push("Valor da nota deve ser maior que zero.");

  return { dps, errors };
}

export function interpretNfseResponse(body: unknown): NfseProviderResult {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body as Row : {};
  const rawErrors = Array.isArray(payload.erros) ? payload.erros : [];
  const errors = rawErrors.map((item) => {
    const error = row(item);
    const code = clean(error.Codigo || error.codigo);
    const description = clean(error.Descricao || error.descricao);
    const detail = clean(error.Complemento || error.complemento);
    return [code, description, detail].filter(Boolean).join(" - ");
  }).filter(Boolean);
  const externalId = clean(payload.idNfse || payload.numeroNfse || payload.numero_nfse || payload.numero);
  const protocol = clean(payload.chaveAcesso || payload.chave_acesso || payload.protocolo);
  const verificationCode = clean(payload.codigoVerificacao || payload.codigo_verificacao);
  const hasConfirmation = Boolean(externalId || protocol || verificationCode || payload.nfseXmlGZipB64);

  if (errors.length) {
    return {
      ok: false,
      status: "rejeitada",
      provider: "nfse_nacional",
      message: errors.join(" | "),
      protocol: clean(payload.idDPS) || undefined,
      responsePayload: payload
    };
  }

  return {
    ok: hasConfirmation,
    status: hasConfirmation ? "autorizada" : "erro_integracao",
    provider: "nfse_nacional",
    message: hasConfirmation
      ? "NFS-e Nacional autorizada pela SEFIN."
      : clean(payload.mensagem || payload.message || payload.xMotivo) || "A SEFIN nao confirmou a emissao da NFS-e.",
    protocol,
    externalId,
    verificationCode,
    responsePayload: payload
  };
}
