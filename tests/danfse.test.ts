import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import test from "node:test";
import { findAuthorizedNfseXml } from "../src/lib/fiscal/nfse-xml.ts";
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
