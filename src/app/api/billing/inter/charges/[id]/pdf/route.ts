import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getStoredInterChargePdf } from "@/server/services/inter-charge-service";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Usuario nao autenticado." }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("id,company_id,active").eq("id", user.id).maybeSingle();
  if (!profile?.company_id || !profile.active) return NextResponse.json({ error: "Empresa ativa nao encontrada." }, { status: 403 });
  const { id } = await context.params;
  const { data: charge } = await supabase.from("boleto_charges").select("id").eq("id", id).eq("company_id", profile.company_id).maybeSingle();
  if (!charge) return NextResponse.json({ error: "Cobranca nao encontrada." }, { status: 404 });

  try {
    const content = await getStoredInterChargePdf(profile.company_id, charge.id, profile.id);
    return new NextResponse(new Uint8Array(content), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="cobranca-inter-${charge.id.slice(0, 8)}.pdf"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF indisponivel." }, { status: 422 });
  }
}
