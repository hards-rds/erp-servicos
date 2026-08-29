import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission } from "@/lib/auth/api-access";

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "dashboard", action: "visualizar" });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return NextResponse.redirect(new URL("/notificacoes?status=forbidden", request.url), 303);
  }
  const formData = await request.formData();
  const notificationId = String(formData.get("notificationId") || "").trim();
  let query = access.supabase.from("app_notifications").update({ read_at: new Date().toISOString() })
    .eq("company_id", access.profile.company_id).is("read_at", null);
  if (notificationId) query = query.eq("id", notificationId);
  await query;
  return NextResponse.redirect(new URL("/notificacoes", request.url), 303);
}
