import { NextRequest, NextResponse } from "next/server";
import { getSchoolContext } from "@/lib/school/server";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

export async function POST(request: NextRequest) {
  const context = await getSchoolContext();
  if (!context.user) return NextResponse.redirect(new URL("/login", request.url), 303);
  const target = new URL("/escola/presencas", request.url);
  if (!context.allowed || !context.profile?.company_id) {
    target.searchParams.set("status", "forbidden");
    return NextResponse.redirect(target, 303);
  }

  const { supabase, profile } = context;
  const formData = await request.formData();
  const classId = value(formData, "classId");
  const attendanceDate = value(formData, "attendanceDate");
  target.searchParams.set("classId", classId);
  target.searchParams.set("date", attendanceDate);
  if (!classId || !attendanceDate) {
    target.searchParams.set("status", "invalid");
    return NextResponse.redirect(target, 303);
  }

  const { data: enrollments } = await supabase.from("school_enrollments")
    .select("id,athlete_id,class_id")
    .eq("company_id", profile.company_id)
    .eq("class_id", classId)
    .eq("status", "ativa");
  const rows = (enrollments || []).map((enrollment) => ({
    company_id: profile.company_id,
    enrollment_id: enrollment.id,
    athlete_id: enrollment.athlete_id,
    class_id: enrollment.class_id,
    attendance_date: attendanceDate,
    status: value(formData, `status_${enrollment.id}`) || "presente",
    notes: value(formData, `notes_${enrollment.id}`) || null,
    recorded_by: profile.id,
    updated_at: new Date().toISOString()
  }));
  const validStatuses = new Set(["presente", "ausente", "justificada"]);
  if (!rows.length || rows.some((row) => !validStatuses.has(row.status))) {
    target.searchParams.set("status", "invalid");
    return NextResponse.redirect(target, 303);
  }

  const { error } = await supabase.from("school_attendance").upsert(rows, {
    onConflict: "company_id,enrollment_id,attendance_date"
  });
  target.searchParams.set("status", error ? "error" : "saved");
  return NextResponse.redirect(target, 303);
}
