import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission } from "@/lib/auth/api-access";
import { getStoredInterChargePdf } from "@/server/services/inter-charge-service";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await requireCompanyPermission({ module: "financeiro.cobrancas", action: "visualizar" });
  if (!access.ok) return NextResponse.json({ error: access.reason === "unauthorized" ? "Usuario nao autenticado." : "Acesso negado." }, { status: access.reason === "unauthorized" ? 401 : 403 });
  const { supabase, profile } = access;
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
