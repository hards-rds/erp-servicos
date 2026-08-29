import { NextRequest, NextResponse } from "next/server";
import { getSchoolContext, schoolScore } from "@/lib/school/server";
import { isValidCpfOrCnpj, onlyDigits } from "@/lib/validations/br-documents";

function value(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function listRedirect(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/escola/atletas?status=${status}`, request.url), 303);
}

function editRedirect(request: NextRequest, athleteId: string, status: string) {
  return NextResponse.redirect(new URL(`/escola/atletas/${athleteId}/editar?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = value(formData, "action") || "create";
  const permissionAction = action === "delete" ? "excluir" : action === "update" ? "editar" : "criar";
  const context = await getSchoolContext(permissionAction);
  if (!context.user) return NextResponse.redirect(new URL("/login", request.url), 303);
  if (!context.allowed || !context.profile?.company_id) return listRedirect(request, "forbidden");

  const { supabase, profile } = context;
  const athleteId = value(formData, "athleteId");

  if (action === "delete") {
    if (!athleteId) return listRedirect(request, "invalid");
    const { data, error } = await supabase
      .from("school_athletes")
      .delete()
      .eq("id", athleteId)
      .eq("company_id", profile.company_id)
      .select("id");
    if (error?.code === "23503") return listRedirect(request, "linked");
    return listRedirect(request, error || !data?.length ? "error" : "deleted");
  }

  if (action === "add_evaluation") {
    if (!athleteId || !value(formData, "evaluationDate") || !value(formData, "evaluatorName")) {
      return editRedirect(request, athleteId, "evaluation_invalid");
    }
    const { data: athlete } = await supabase
      .from("school_athletes")
      .select("id")
      .eq("id", athleteId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!athlete) return listRedirect(request, "not_found");

    const { error } = await supabase.from("school_athlete_evaluations").insert({
      company_id: profile.company_id,
      athlete_id: athleteId,
      evaluation_date: value(formData, "evaluationDate"),
      evaluator_name: value(formData, "evaluatorName"),
      physical_data: {
        speed: schoolScore(value(formData, "speed")),
        endurance: schoolScore(value(formData, "endurance")),
        strength: schoolScore(value(formData, "strength"))
      },
      technical_data: {
        passing: schoolScore(value(formData, "passing")),
        shooting: schoolScore(value(formData, "shooting")),
        dribbling: schoolScore(value(formData, "dribbling")),
        marking: schoolScore(value(formData, "marking"))
      },
      tactical_data: {
        gameReading: schoolScore(value(formData, "gameReading")),
        discipline: schoolScore(value(formData, "discipline"))
      },
      notes: value(formData, "evaluationNotes") || null,
      created_by: profile.id
    });
    return editRedirect(request, athleteId, error ? "evaluation_error" : "evaluation_created");
  }

  const fullName = value(formData, "fullName");
  const birthDate = value(formData, "birthDate");
  const guardianName = value(formData, "guardianName");
  const athleteDocument = onlyDigits(value(formData, "athleteDocument"));
  const guardianDocument = onlyDigits(value(formData, "guardianDocument"));
  const clientId = value(formData, "clientId") || null;

  if (!fullName || !birthDate || !guardianName) return listRedirect(request, "invalid");
  if ((athleteDocument && !isValidCpfOrCnpj(athleteDocument)) || (guardianDocument && !isValidCpfOrCnpj(guardianDocument))) {
    return listRedirect(request, "invalid_document");
  }
  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("id", clientId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!client) return listRedirect(request, "invalid_client");
  }

  const guardianPayload = {
    client_id: clientId,
    full_name: guardianName,
    document: guardianDocument || null,
    relationship: value(formData, "relationship") || null,
    email: value(formData, "guardianEmail") || null,
    phone: value(formData, "guardianPhone") || null,
    emergency_phone: value(formData, "emergencyPhone") || null,
    active: true,
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };
  const athletePayload = {
    full_name: fullName,
    document: athleteDocument || null,
    birth_date: birthDate,
    preferred_position: value(formData, "preferredPosition") || null,
    dominant_foot: value(formData, "dominantFoot") || null,
    category: value(formData, "category") || null,
    emergency_contact: value(formData, "emergencyContact") || null,
    medical_notes: value(formData, "medicalNotes") || null,
    image_authorization: formData.get("imageAuthorization") === "on",
    data_consent_at: formData.get("dataConsent") === "on" ? new Date().toISOString() : null,
    status: value(formData, "status") || "ativo",
    updated_by: profile.id,
    updated_at: new Date().toISOString()
  };

  if (action === "update") {
    if (!athleteId) return listRedirect(request, "invalid");
    const { data: athlete } = await supabase
      .from("school_athletes")
      .select("id,guardian_id")
      .eq("id", athleteId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (!athlete) return listRedirect(request, "not_found");

    let guardianId = athlete.guardian_id as string | null;
    if (guardianId) {
      const { error } = await supabase.from("school_guardians").update(guardianPayload)
        .eq("id", guardianId).eq("company_id", profile.company_id);
      if (error) return editRedirect(request, athleteId, error.code === "23505" ? "duplicate" : "error");
    } else {
      const { data: guardian, error } = await supabase.from("school_guardians").insert({
        company_id: profile.company_id,
        ...guardianPayload,
        created_by: profile.id
      }).select("id").single();
      if (error || !guardian) return editRedirect(request, athleteId, error?.code === "23505" ? "duplicate" : "error");
      guardianId = guardian.id;
    }

    const { error } = await supabase.from("school_athletes").update({ ...athletePayload, guardian_id: guardianId })
      .eq("id", athleteId).eq("company_id", profile.company_id);
    return error ? editRedirect(request, athleteId, error.code === "23505" ? "duplicate" : "error") : listRedirect(request, "updated");
  }

  const { data: guardian, error: guardianError } = await supabase.from("school_guardians").insert({
    company_id: profile.company_id,
    ...guardianPayload,
    created_by: profile.id
  }).select("id").single();
  if (guardianError || !guardian) return listRedirect(request, guardianError?.code === "23505" ? "duplicate" : "error");

  const { error } = await supabase.from("school_athletes").insert({
    company_id: profile.company_id,
    guardian_id: guardian.id,
    ...athletePayload,
    created_by: profile.id
  });
  if (error) {
    await supabase.from("school_guardians").delete().eq("id", guardian.id).eq("company_id", profile.company_id);
  }
  return listRedirect(request, error ? (error.code === "23505" ? "duplicate" : "error") : "created");
}
