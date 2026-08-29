import { NextRequest, NextResponse } from "next/server";
import { runRecurringAutomation } from "@/server/services/recurrence-automation-service";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, summary: await runRecurringAutomation() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha no processamento recorrente.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = GET;
