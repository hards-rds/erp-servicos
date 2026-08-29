import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEALTH_TIMEOUT_MS = 4_000;

async function checkDatabase() {
  const service = createServiceClient();
  const query = service.from("companies").select("id", { head: true, count: "exact" }).limit(1);
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("health_check_timeout")), HEALTH_TIMEOUT_MS);
  });
  try {
    const result = await Promise.race([query, timeout]);
    if (result.error) throw result.error;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export async function GET() {
  const checkedAt = new Date().toISOString();

  try {
    await checkDatabase();
    return NextResponse.json(
      {
        status: "ok",
        checkedAt,
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
        checks: { application: "ok", database: "ok" }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        checkedAt,
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "local",
        checks: { application: "ok", database: "error" }
      },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
