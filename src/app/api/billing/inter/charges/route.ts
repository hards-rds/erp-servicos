import { createInterCharge } from "@/lib/integrations/inter-client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
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
