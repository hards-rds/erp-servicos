import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission } from "@/lib/auth/api-access";
import { isValidCnpj, isValidCpf, onlyDigits } from "@/lib/validations/br-documents";
import { lookupCnpjRegistration } from "@/lib/integrations/brasil-api";

export async function GET(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "cadastros.clientes", action: "visualizar" });
  if (!access.ok) {
    return NextResponse.json(
      { error: access.reason === "unauthorized" ? "Nao autenticado." : "Acesso negado." },
      { status: access.reason === "unauthorized" ? 401 : 403 }
    );
  }

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

  try {
    const registration = await lookupCnpjRegistration(document);
    return NextResponse.json({
      ...registration,
      type: "cnpj"
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Nao foi possivel consultar esse CNPJ agora. Voce ainda pode preencher manualmente.",
        detail: error instanceof Error ? error.message : undefined
      },
      { status: 502 }
    );
  }
}
