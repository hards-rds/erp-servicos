import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const allowedStatuses = new Set(["previsto", "aprovado", "pago"]);

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseMoney(value: string) {
  const compact = value.replace(/\s/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/financeiro/saidas?status=${status}`, request.url), 303);
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

  if (!profile?.company_id) return redirectWith(request, "profile_error");

  const formData = await request.formData();
  const vendorName = readString(formData, "vendorName");
  const category = readString(formData, "category");
  const description = readString(formData, "description");
  const competence = readString(formData, "competence");
  const dueDate = readString(formData, "dueDate");
  const status = readString(formData, "status");
  const amount = parseMoney(readString(formData, "amount"));
  const paidAt = readString(formData, "paidAt");
  const paymentMethod = readString(formData, "paymentMethod");

  const invalid =
    !vendorName ||
    !category ||
    !description ||
    !/^\d{4}-\d{2}$/.test(competence) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    !allowedStatuses.has(status) ||
    amount === null ||
    amount <= 0 ||
    (status === "pago" && (!paidAt || !paymentMethod));

  if (invalid) return redirectWith(request, "invalid");

  const now = new Date().toISOString();
  const { error } = await supabase.from("payables").insert({
    company_id: profile.company_id,
    vendor_name: vendorName,
    category,
    description,
    competence,
    due_date: dueDate,
    amount,
    status,
    paid_at: status === "pago" ? paidAt : null,
    payment_method: status === "pago" ? paymentMethod : null,
    approved_by: ["aprovado", "pago"].includes(status) ? profile.id : null,
    paid_by: status === "pago" ? profile.id : null,
    notes: readString(formData, "notes") || null,
    created_by: profile.id,
    updated_by: profile.id,
    created_at: now,
    updated_at: now
  });

  if (error) return redirectWith(request, "error");

  return redirectWith(request, "created");
}
