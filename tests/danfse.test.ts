import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import test from "node:test";
import {
  extractAuthorizedNfseIdentity,
  findAuthorizedNfseXml,
  resolveOfficialNfseNumber
} from "../src/lib/fiscal/nfse-xml.ts";
import { buildGovernmentDanfsePdf } from "../src/lib/pdf/government-danfse.ts";

const accessKey = "12345678901234567890123456789012345678901234567890";
const authorizedXml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe Id="NFS${accessKey}">
    <nNFSe>123</nNFSe><dhProc>2026-08-19T14:30:00-03:00</dhProc><cStat>100</cStat>
    <xLocEmi>Uberlandia</xLocEmi><ambGer>SEFIN Nacional</ambGer><xTribNac>Suporte tecnico</xTribNac>
    <emit><CNPJ>26704175000173</CNPJ><IM>12345</IM><xNome>Mundo Livre Tecnologia</xNome><enderNac><cMun>3170206</cMun><CEP>38400000</CEP></enderNac><xLgr>Rua Teste</xLgr><nro>100</nro><xBairro>Centro</xBairro></emit>
    <DPS><infDPS><tpAmb>1</tpAmb><dhEmi>2026-08-19T14:29:00-03:00</dhEmi><serie>900</serie><nDPS>321</nDPS><dCompet>2026-08-01</dCompet><tpEmit>1</tpEmit>
      <prest><fone>34999999999</fone><email>fiscal@mundolivre.com.br</email><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN></regTrib></prest>
      <toma><CNPJ>35039173000106</CNPJ><xNome>Saber Contabil LTDA</xNome><end><endNac><cMun>3170206</cMun><CEP>38400000</CEP></endNac><xLgr>Av Cliente</xLgr><nro>10</nro><xBairro>Centro</xBairro></end><email>cliente@example.com</email></toma>
      <serv><locPrest><cLocPrestacao>3170206</cLocPrestacao></locPrest><cServ><cTribNac>010701</cTribNac><cTribMun>001</cTribMun><xDescServ>Prestacao de servicos em rede de computadores e sistemas.</xDescServ><cNBS>123456789</cNBS></cServ></serv>
      <valores><vServPrest><vServ>1175.00</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun><totTrib><pTotTrib><pTotTribFed>13.45</pTotTribFed><pTotTribEst>0.00</pTotTribEst><pTotTribMun>3.05</pTotTribMun></pTotTrib></totTrib></trib></valores>
    </infDPS></DPS>
    <valores><vBC>1175.00</vBC><pAliqAplic>3.05</pAliqAplic><vISSQN>35.84</vISSQN><vLiq>1175.00</vLiq></valores>
  </infNFSe>
</NFSe>`;

test("extrai o XML autorizado aninhado e compactado no retorno da SEFIN", () => {
  const payload = { retorno: { nfseXmlGZipB64: gzipSync(Buffer.from(authorizedXml)).toString("base64") } };
  assert.equal(findAuthorizedNfseXml(payload), authorizedXml);
  assert.deepEqual(extractAuthorizedNfseIdentity(payload), { number: "123", accessKey });
  assert.equal(resolveOfficialNfseNumber(null, payload), "123");
  assert.equal(resolveOfficialNfseNumber("456", payload), "456");
});

test("gera DANFSe v2.0 em PDF a partir do XML autorizado", async () => {
  const pdf = await buildGovernmentDanfsePdf(authorizedXml);
  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.ok(pdf.length > 5000);
});

test("empacota as fontes padrao do PDFKit nas rotas que geram DANFSe", () => {
  const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  assert.match(config, /serverExternalPackages: \["pdfkit"\]/);
  for (const route of ["danfse", "emitir", "enviar-email"]) {
    assert.match(config, new RegExp(`/api/fiscal/nfse/${route}`));
  }
  assert.match(config, /node_modules\/pdfkit\/js\/data\/\*\.afm/);
});

test("DANFSe segue as secoes fiscais do layout nacional v2", () => {
  const source = readFileSync(new URL("../src/lib/pdf/government-danfse.ts", import.meta.url), "utf8");
  for (const section of [
    "DESTINATARIO DA OPERACAO",
    "TRIBUTACAO MUNICIPAL (ISSQN)",
    "TRIBUTACAO FEDERAL (EXCETO CBS)",
    "TRIBUTACAO IBS/CBS",
    "VALOR TOTAL DA NFS-e",
    "DATA CIENTIFICACAO",
    "IDENTIFICACAO E ASSINATURA"
  ]) {
    assert.match(source, new RegExp(section.replace(/[()]/g, "\\$&")));
  }
});

test("fila fiscal permite selecionar e emitir varias notas", () => {
  const component = readFileSync(new URL("../src/components/fiscal/nfse-batch-queue.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../src/app/(dashboard)/fiscal/emissao-nfse/page.tsx", import.meta.url), "utf8");
  const issuedPage = readFileSync(new URL("../src/app/(dashboard)/fiscal/notas-emitidas/page.tsx", import.meta.url), "utf8");
  assert.match(component, /Selecionar todas as notas da fila/);
  assert.match(component, /Emitir selecionadas/);
  assert.match(component, /selectedIds\.length/);
  assert.match(component, /\/api\/fiscal\/nfse\/emitir/);
  assert.match(component, /productionConfirmed/);
  assert.match(page, /permission_action: "emitir"/);
  assert.match(issuedPage, /Atualizar PDF/);
});
