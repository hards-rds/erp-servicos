type PdfCommand = string;

function escapePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dateText(value: unknown) {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "-";
  return new Date(`${raw}T00:00:00`).toLocaleDateString("pt-BR");
}

export type DanfsePdfData = {
  companyName: string;
  companyDocument: string;
  companyMunicipalRegistration?: string;
  clientName: string;
  clientDocument: string;
  clientEmail?: string | null;
  number: string;
  accessKey?: string;
  verificationCode?: string;
  competence: string;
  issuedAt?: string;
  serviceDescription: string;
  serviceCode?: string;
  cityCode?: string;
  amount: number | string;
  protocol?: string | null;
  status: string;
};

class SimplePdfPage {
  private readonly commands: PdfCommand[] = [];

  text(x: number, y: number, value: unknown, size = 10, font = "F1") {
    this.commands.push(`BT /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`);
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    this.commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  }

  rect(x: number, y: number, width: number, height: number) {
    this.commands.push(`${x} ${y} ${width} ${height} re S`);
  }

  fillRect(x: number, y: number, width: number, height: number, gray = 0.94) {
    this.commands.push(`q ${gray} g ${x} ${y} ${width} ${height} re f Q`);
  }

  wrappedText(x: number, y: number, width: number, value: unknown, size = 10, lineHeight = 14) {
    const words = String(value ?? "-").split(/\s+/).filter(Boolean);
    const maxChars = Math.max(20, Math.floor(width / (size * 0.48)));
    let line = "";
    let cursor = y;

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maxChars && line) {
        this.text(x, cursor, line, size);
        cursor -= lineHeight;
        line = word;
      } else {
        line = candidate;
      }
    }

    if (line) this.text(x, cursor, line, size);
    return cursor - lineHeight;
  }

  render() {
    return this.commands.join("\n");
  }
}

export function buildDanfsePdf(data: DanfsePdfData) {
  const page = new SimplePdfPage();
  page.fillRect(0, 792 - 84, 612, 84, 0.96);
  page.text(42, 742, "DANFSe", 24, "F2");
  page.text(42, 720, "Documento Auxiliar da Nota Fiscal de Servico Eletronica", 10);
  page.text(430, 742, `Numero ${data.number || "-"}`, 12, "F2");
  page.text(430, 722, `Status ${data.status}`, 9);
  page.line(42, 694, 570, 694);

  page.text(42, 670, "Prestador", 13, "F2");
  page.rect(42, 590, 528, 66);
  page.text(56, 635, data.companyName, 11, "F2");
  page.text(56, 616, `CNPJ ${data.companyDocument || "-"}`, 10);
  page.text(310, 616, `IM ${data.companyMunicipalRegistration || "-"}`, 10);

  page.text(42, 562, "Tomador", 13, "F2");
  page.rect(42, 482, 528, 66);
  page.text(56, 527, data.clientName, 11, "F2");
  page.text(56, 508, `CPF/CNPJ ${data.clientDocument || "-"}`, 10);
  page.text(310, 508, `Email ${data.clientEmail || "-"}`, 10);

  page.text(42, 454, "Servico", 13, "F2");
  page.rect(42, 304, 528, 136);
  page.text(56, 419, `Competencia ${data.competence || "-"}`, 10);
  page.text(210, 419, `Emissao ${dateText(data.issuedAt)}`, 10);
  page.text(370, 419, `Valor ${money(data.amount)}`, 11, "F2");
  page.text(56, 394, `Codigo nacional ${data.serviceCode || "-"}`, 10);
  page.text(250, 394, `Municipio ${data.cityCode || "-"}`, 10);
  page.wrappedText(56, 365, 470, data.serviceDescription, 10, 14);

  page.text(42, 274, "Controle Fiscal", 13, "F2");
  page.rect(42, 158, 528, 102);
  page.wrappedText(56, 236, 470, `Chave de acesso: ${data.accessKey || "-"}`, 9, 13);
  page.text(56, 204, `Codigo de verificacao: ${data.verificationCode || "-"}`, 9);
  page.text(56, 184, `Protocolo: ${data.protocol || "-"}`, 9);

  page.line(42, 98, 570, 98);
  page.text(42, 78, "Este documento foi gerado automaticamente pelo ERP Servicos Mundo Livre.", 8);
  page.text(42, 62, "Consulte a validade da NFS-e no portal nacional ou no municipio competente.", 8);

  const content = page.render();
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}
