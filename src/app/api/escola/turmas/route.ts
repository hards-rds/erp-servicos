import { NextRequest, NextResponse } from "next/server";
import { getSchoolContext, parseSchoolMoney } from "@/lib/school/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/escola/turmas?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = value(formData, "action") || "create";
  const permissionAction = action === "delete" ? "excluir" : action === "update" ? "editar" : "criar";
  const context = await getSchoolContext(permissionAction);
  if (!context.user) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!context.allowed || !context.profile?.company_id) return redirectWith(request, "forbidden");

  const { supabase, profile } = context;
  const classId = value(formData, "classId");

  if (action === "delete") {
    const { data, error } = await supabase.from("school_classes").delete()
      .eq("id", classId).eq("company_id", profile.company_id).select("id");
    if (error?.code === "23503") return redirectWith(request, "linked");
    return redirectWith(request, error || !data?.length ? "error" : "deleted");
  }

  const name = value(formData, "name");
  const category = value(formData, "category");
  const monthlyFee = parseSchoolMoney(value(formData, "monthlyFee"));
  const capacityText = value(formData, "capacity");
  const capacity = capacityText ? Number(capacityText) : null;
  if (!name || !category || monthlyFee === null || monthlyFee < 0 || (capacity !== null && (!Number.isInteger(capacity) || capacity < 1))) {
    return redirectWith(request, "invalid");
  }

  const payload = {
    name,
    category,
    age_group: value(formData, "ageGroup") || null,
    coach_name: value(formData, "coachName") || null,
    capacity,
    schedule: {
      days: value(formData, "scheduleDays"),
      startTime: value(formData, "startTime"),
      endTime: value(formData, "endTime")
    },
    location: value(formData, "location") || null,
    default_monthly_fee: monthlyFee,
    active: value(formData, "active") !== "false",
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };

  if (action === "update") {
    const { error } = await supabase.from("school_classes").update(payload)
      .eq("id", classId).eq("company_id", profile.company_id);
    return redirectWith(request, error ? (error.code === "23505" ? "duplicate" : "error") : "updated");
  }

  const { error } = await supabase.from("school_classes").insert({
    company_id: profile.company_id,
    ...payload,
    created_by: profile.id
  });
  return redirectWith(request, error ? (error.code === "23505" ? "duplicate" : "error") : "created");
}
