import { NextRequest, NextResponse } from "next/server";
import { getInterCharge } from "@/lib/integrations/inter-client";
import { loadActiveInterCredentials } from "@/lib/integrations/inter-credentials";
import { createServiceClient } from "@/lib/supabase/server";
import { applyInterChargePayload } from "@/server/services/inter-charge-service";

export const runtime = "nodejs";

type Row = Record<string, unknown>;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Payload invalido." }, { status: 400 });
  }
  const events = (Array.isArray(body) ? body : [body]).filter((item): item is Row => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  if (!events.length) return NextResponse.json({ error: "Evento vazio." }, { status: 400 });

  const supabase = createServiceClient();
  for (const event of events) {
    const externalId = String(event.codigoSolicitacao || "").trim();
    if (!externalId) continue;
    const { data: charge } = await supabase
      .from("boleto_charges")
      .select("id,company_id")
      .eq("external_id", externalId)
      .maybeSingle();
    if (!charge) continue;

    try {
      const credentials = await loadActiveInterCredentials(charge.company_id);
      const verifiedPayload = await getInterCharge(externalId, credentials);
      await applyInterChargePayload({
        companyId: charge.company_id,
        chargeId: charge.id,
        payload: { ...event, ...verifiedPayload, webhookReceivedAt: new Date().toISOString() },
        source: "webhook"
      });
    } catch {
      return NextResponse.json({ error: "Nao foi possivel validar o evento no Banco Inter." }, { status: 503 });
    }
  }

  return new NextResponse(null, { status: 204 });
}
