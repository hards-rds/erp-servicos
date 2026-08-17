import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) {
    return redirectWith(request, "profile_error");
  }

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

  const { error } = await supabase.from("client_optical_records").insert({
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
  });

  return redirectWith(request, error ? "optical_error" : "optical_created");
}
