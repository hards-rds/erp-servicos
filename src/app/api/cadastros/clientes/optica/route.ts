import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function emptyToNull(value: string) {
  return value || null;
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/cadastros/clientes?status=${status}`, request.url), 303);
}

function readEye(formData: FormData, prefix: "right" | "left") {
  return {
    sphere: emptyToNull(readString(formData, `${prefix}Sphere`)),
    cylinder: emptyToNull(readString(formData, `${prefix}Cylinder`)),
    axis: emptyToNull(readString(formData, `${prefix}Axis`)),
    addition: emptyToNull(readString(formData, `${prefix}Addition`)),
    pd: emptyToNull(readString(formData, `${prefix}Pd`))
  };
}

export async function POST(request: NextRequest) {
  const access = await requireCompanyPermission({ module: "cadastros.clientes", action: "editar", segment: "otica" });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { supabase, profile } = access;

  const formData = await request.formData();
  const clientId = readString(formData, "clientId");
  const examDate = readString(formData, "examDate");

  if (!clientId || !examDate) {
    return redirectWith(request, "optical_invalid");
  }

  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("id", clientId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!client) {
    return redirectWith(request, "optical_invalid");
  }

  const { data: created, error } = await supabase.from("client_optical_records").insert({
    company_id: profile.company_id,
    client_id: client.id,
    exam_date: examDate,
    professional_name: emptyToNull(readString(formData, "professionalName")),
    right_eye: readEye(formData, "right"),
    left_eye: readEye(formData, "left"),
    clinical_data: {
      complaint: emptyToNull(readString(formData, "complaint")),
      visualAcuityRight: emptyToNull(readString(formData, "visualAcuityRight")),
      visualAcuityLeft: emptyToNull(readString(formData, "visualAcuityLeft")),
      binocularPd: emptyToNull(readString(formData, "binocularPd")),
      lensType: emptyToNull(readString(formData, "lensType")),
      frameNotes: emptyToNull(readString(formData, "frameNotes"))
    },
    notes: emptyToNull(readString(formData, "notes")),
    created_by: profile.id
  }).select("id").single();

  if (!error && created) await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "client_optical_record", entityId: created.id, action: "create", metadata: { clientId: client.id, examDate } });

  return redirectWith(request, error ? "optical_error" : "optical_created");
}
