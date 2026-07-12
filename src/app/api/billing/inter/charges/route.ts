import { createInterCharge } from "@/lib/integrations/inter-client";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Usuario nao autenticado." }, { status: 401 });
  }

  try {
    const draft = await request.json();
    const result = await createInterCharge(draft);
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao criar cobranca.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
