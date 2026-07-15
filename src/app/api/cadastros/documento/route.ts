import { NextRequest, NextResponse } from "next/server";
import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/validations/br-documents";

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
  uf?: string;
  cep?: string;
};

export async function GET(request: NextRequest) {
  const document = onlyDigits(request.nextUrl.searchParams.get("document") || "");

  if (document.length === 11) {
    if (!isValidCpf(document)) {
      return NextResponse.json({ error: "CPF invalido." }, { status: 400 });
    }

    return NextResponse.json({
      document,
      type: "cpf",
      message: "CPF validado. Preencha os dados cadastrais manualmente."
    });
  }

  if (document.length !== 14 || !isValidCnpj(document)) {
    return NextResponse.json({ error: "CPF/CNPJ invalido." }, { status: 400 });
  }

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${document}`, {
    next: { revalidate: 60 * 60 * 24 * 7 }
  });

  if (!response.ok) {
    return NextResponse.json(
      { error: "Nao foi possivel consultar esse CNPJ agora. Voce ainda pode preencher manualmente." },
      { status: 502 }
    );
  }

  const data = (await response.json()) as BrasilApiCnpj;

  return NextResponse.json({
    document,
    type: "cnpj",
    legalName: data.razao_social || "",
    tradeName: data.nome_fantasia || "",
    phone: data.ddd_telefone_1 || "",
    fiscalEmail: data.email || "",
    financialEmail: data.email || "",
    address: {
      street: data.logradouro || "",
      number: data.numero || "",
      complement: data.complemento || "",
      district: data.bairro || "",
      city: data.municipio || "",
      state: data.uf || "",
      zipCode: data.cep || ""
    }
  });
}
