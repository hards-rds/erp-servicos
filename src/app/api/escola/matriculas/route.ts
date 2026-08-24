import { NextRequest, NextResponse } from "next/server";
import { competenceFromDate, dueDateForCompetence } from "@/lib/dates/competence";
import { getSchoolContext, parseSchoolMoney } from "@/lib/school/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/escola/matriculas?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const context = await getSchoolContext();
  if (!context.user) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!context.allowed || !context.profile?.company_id) return redirectWith(request, "forbidden");

  const { supabase, profile } = context;
  const formData = await request.formData();
  const action = value(formData, "action") || "create";
  const enrollmentId = value(formData, "enrollmentId");

  if (action === "generate_financial") {
    const { data: enrollment } = await supabase.from("school_enrollments")
      .select("id,athlete_id,guardian_id,due_day,monthly_amount,discount_amount,status")
      .eq("id", enrollmentId).eq("company_id", profile.company_id).maybeSingle();
    if (!enrollment || enrollment.status !== "ativa") return redirectWith(request, "inactive");

    const [{ data: athlete }, { data: guardian }] = await Promise.all([
      supabase.from("school_athletes").select("full_name").eq("id", enrollment.athlete_id).eq("company_id", profile.company_id).maybeSingle(),
      enrollment.guardian_id
        ? supabase.from("school_guardians").select("full_name,client_id").eq("id", enrollment.guardian_id).eq("company_id", profile.company_id).maybeSingle()
        : Promise.resolve({ data: null })
    ]);
    const competence = competenceFromDate(new Date());
    const dueDate = dueDateForCompetence(competence, Number(enrollment.due_day));
    const grossAmount = Number(enrollment.monthly_amount);
    const discount = Math.min(Number(enrollment.discount_amount), grossAmount);
    const idempotencyKey = `school-enrollment:${enrollment.id}:competence:${competence}`;
    const { error } = await supabase.from("financial_entries").upsert({
      company_id: profile.company_id,
      client_id: guardian?.client_id || null,
      school_enrollment_id: enrollment.id,
      type: "recorrente",
      description: `Mensalidade escolar - ${athlete?.full_name || "Atleta"}`,
      competence,
      due_date: dueDate,
      gross_amount: grossAmount,
      discounts: discount,
      interest: 0,
      penalty: 0,
      net_amount: grossAmount - discount,
      status: "previsto",
      idempotency_key: idempotencyKey,
      notes: guardian?.full_name ? `Responsavel: ${guardian.full_name}` : "Mensalidade gerada a partir da matricula.",
      created_by: profile.id,
      updated_by: profile.id,
      updated_at: new Date().toISOString()
    }, { onConflict: "company_id,idempotency_key", ignoreDuplicates: true });
    return redirectWith(request, error ? "financial_error" : "financial_generated");
  }

  if (action === "delete") {
    const { data, error } = await supabase.from("school_enrollments").delete()
      .eq("id", enrollmentId).eq("company_id", profile.company_id).select("id");
    if (error?.code === "23503") return redirectWith(request, "linked");
    return redirectWith(request, error || !data?.length ? "error" : "deleted");
  }

  const athleteId = value(formData, "athleteId");
  const classId = value(formData, "classId");
  const monthlyAmount = parseSchoolMoney(value(formData, "monthlyAmount"));
  const discountAmount = parseSchoolMoney(value(formData, "discountAmount") || "0");
  const dueDay = Number(value(formData, "dueDay"));
  if (!athleteId || !classId || monthlyAmount === null || monthlyAmount < 0 || discountAmount === null || discountAmount < 0 || discountAmount > monthlyAmount || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    return redirectWith(request, "invalid");
  }

  const [{ data: athlete }, { data: schoolClass }] = await Promise.all([
    supabase.from("school_athletes").select("id,guardian_id").eq("id", athleteId).eq("company_id", profile.company_id).maybeSingle(),
    supabase.from("school_classes").select("id").eq("id", classId).eq("company_id", profile.company_id).maybeSingle()
  ]);
  if (!athlete || !schoolClass) return redirectWith(request, "invalid_relation");

  const payload = {
    athlete_id: athleteId,
    class_id: classId,
    guardian_id: athlete.guardian_id || null,
    starts_at: value(formData, "startsAt") || new Date().toISOString().slice(0, 10),
    ends_at: value(formData, "endsAt") || null,
    due_day: dueDay,
    monthly_amount: monthlyAmount,
    discount_amount: discountAmount,
    status: value(formData, "status") || "ativa",
    notes: value(formData, "notes") || null,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };

  if (action === "update") {
    const { error } = await supabase.from("school_enrollments").update(payload)
      .eq("id", enrollmentId).eq("company_id", profile.company_id);
    return redirectWith(request, error ? (error.code === "23505" ? "duplicate" : "error") : "updated");
  }

  const { error } = await supabase.from("school_enrollments").insert({
    company_id: profile.company_id,
    ...payload,
    created_by: profile.id
  });
  return redirectWith(request, error ? (error.code === "23505" ? "duplicate" : "error") : "created");
}
