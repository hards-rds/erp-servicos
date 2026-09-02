import assert from "node:assert/strict";
import test from "node:test";
import { lookupCnpjRegistration, mergeClientRegistration, registrationChangesClientName } from "../src/lib/integrations/brasil-api.ts";

test("normaliza os dados cadastrais retornados pela consulta de CNPJ", async () => {
  const fetcher = (async () => new Response(JSON.stringify({
    cnpj: "07105582000110",
    razao_social: " PLANET FONE SERVICOS DE INFORMATICA LTDA ",
    nome_fantasia: "Planetfone",
    municipio: "Belo Horizonte",
    codigo_municipio_ibge: 3106200,
    uf: "MG",
    descricao_tipo_de_logradouro: "RUA",
    descricao_situacao_cadastral: "ATIVA"
  }), { status: 200 })) as typeof fetch;

  const registration = await lookupCnpjRegistration("07.105.582/0001-10", fetcher);

  assert.equal(registration.document, "07105582000110");
  assert.equal(registration.legalName, "PLANET FONE SERVICOS DE INFORMATICA LTDA");
  assert.equal(registration.tradeName, "Planetfone");
  assert.equal(registration.address.cityCode, "3106200");
  assert.equal(registration.address.street, "");
  assert.equal(registration.registrationStatus, "ATIVA");
});

test("atualiza identidade e endereco oficial sem apagar contatos operacionais", () => {
  const registered = mergeClientRegistration({
    legal_name: "Planetfone",
    trade_name: null,
    fiscal_email: "fiscal@cliente.com",
    financial_email: null,
    phone: "31999999999",
    address: { street: "Endereco antigo", complement: "Sala local" }
  }, {
    document: "07105582000110",
    legalName: "PLANET FONE SERVICOS DE INFORMATICA LTDA.",
    tradeName: "PLANETFONE",
    phone: "3121252800",
    fiscalEmail: "",
    financialEmail: "cadastro@empresa.com",
    registrationStatus: "ATIVA",
    address: {
      street: "RUA JOSE RODRIGUES PEREIRA",
      number: "514",
      complement: "",
      district: "ESTORIL",
      city: "BELO HORIZONTE",
      cityCode: "3106200",
      state: "MG",
      zipCode: "30455640"
    }
  });

  assert.equal(registered.legal_name, "PLANET FONE SERVICOS DE INFORMATICA LTDA.");
  assert.equal(registered.trade_name, "PLANETFONE");
  assert.equal(registered.phone, "31999999999");
  assert.equal(registered.fiscal_email, "fiscal@cliente.com");
  assert.equal(registered.financial_email, "cadastro@empresa.com");
  assert.deepEqual(registered.address, {
    street: "RUA JOSE RODRIGUES PEREIRA",
    number: "514",
    complement: "Sala local",
    district: "ESTORIL",
    city: "BELO HORIZONTE",
    cityCode: "3106200",
    state: "MG",
    zipCode: "30455640"
  });
});

test("detecta nome fantasia usado indevidamente como razao social", () => {
  assert.equal(registrationChangesClientName("Planetfone", "PLANET FONE SERVICOS DE INFORMATICA LTDA"), true);
  assert.equal(registrationChangesClientName("Brasil Borrachas Ltda", "BRASIL BORRACHAS LTDA"), false);
});
