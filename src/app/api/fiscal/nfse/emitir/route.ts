import { requestNfseEmission, requestNfseNationalEmission } from "@/lib/integrations/nfse-client";
import { mergeNfseFiscalData } from "@/lib/integrations/nfse-national";
import { extractPfxSigningMaterials } from "@/lib/certificates/pfx";
import { decryptCertificateSecret } from "@/lib/certificates/secrets";
import type { NfseRuntimeCertificate } from "@/lib/integrations/nfse-transport";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/fiscal/emissao-nfse?status=${status}`, request.url), 303);
}

function redirectWithMessage(request: NextRequest, status: string, message: string) {
  const target = new URL("/fiscal/emissao-nfse", request.url);
  target.searchParams.set("status", status);
  target.searchParams.set("message", message);
  return NextResponse.redirect(target, 303);
}

async function loadRuntimeCertificate(companyId: string): Promise<{
  certificate?: NfseRuntimeCertificate;
  error?: string;
}> {
  if (process.env.NFSE_REAL_EMISSION !== "true") return {};

  const service = createServiceClient();
  const { data, error } = await service
    .from("digital_certificates")
    .select("encrypted_pfx,encrypted_password,valid_until")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return { error: "Nao foi possivel consultar o certificado digital da empresa." };
  if (!data) return { error: "Certificado digital ativo nao encontrado para esta empresa." };
  if (data.valid_until && new Date(`${data.valid_until}T23:59:59.999-03:00`) < new Date()) {
    return { error: "O certificado digital cadastrado esta expirado." };
  }

  try {
    const pfxBase64 = decryptCertificateSecret(data.encrypted_pfx);
    const password = decryptCertificateSecret(data.encrypted_password);
    const pfx = Buffer.from(pfxBase64, "base64");
    if (!pfx.length) return { error: "O certificado digital armazenado esta vazio." };
    const materials = extractPfxSigningMaterials(pfx, password);

    return {
      certificate: {
        pfx,
        password,
        certificatePem: materials.certificatePem,
        privateKeyPem: materials.privateKeyPem
      }
    };
  } catch (error) {
    return {
      error: error instanceof Error
        ? error.message
        : "Nao foi possivel abrir o certificado digital armazenado."
    };
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("form")) {
      const draft = await request.json();
      const result = await requestNfseEmission(draft);
      return NextResponse.json(result, { status: result.ok ? 200 : 422 });
    }

    const formData = await request.formData();
    const nfseDocumentId = String(formData.get("nfseDocumentId") || "").trim();
    if (!nfseDocumentId) return redirectWith(request, "invalid");
    if (
      process.env.NFSE_ENV === "production"
      && process.env.NFSE_REAL_EMISSION === "true"
      && formData.get("productionConfirmed") !== "true"
    ) {
      return redirectWithMessage(request, "rejected", "Confirme explicitamente a emissao real em producao.");
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id,company_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.company_id) return redirectWith(request, "profile_error");

    const { data: document } = await supabase
      .from("nfse_documents")
      .select(`
        id,
        company_id,
        client_id,
        financial_entry_id,
        competence,
        service_amount,
        request_payload,
        companies(name,document,fiscal_settings),
        clients(legal_name,document,fiscal_email,phone,address),
        financial_entries(id,description,competence,net_amount,contracts(fiscal_service_data))
      `)
      .eq("id", nfseDocumentId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (!document) return redirectWith(request, "not_found");

    const company = Array.isArray(document.companies) ? document.companies[0] : document.companies;
    const client = Array.isArray(document.clients) ? document.clients[0] : document.clients;
    const entry = Array.isArray(document.financial_entries) ? document.financial_entries[0] : document.financial_entries;
    const contract = Array.isArray(entry?.contracts) ? entry?.contracts[0] : entry?.contracts;
    const fiscalData = mergeNfseFiscalData(document.request_payload, contract?.fiscal_service_data);

    if (!company || !client || !entry) return redirectWith(request, "invalid");

    const runtimeCertificate = await loadRuntimeCertificate(profile.company_id);
    const result = await requestNfseNationalEmission({
      documentId: document.id,
      company,
      client,
      entry,
      fiscalData
    }, runtimeCertificate.certificate, runtimeCertificate.error);

    await supabase
      .from("nfse_documents")
      .update({
        status: result.status,
        protocol: result.protocol || null,
        external_id: result.externalId || null,
        rejection_message: result.ok ? null : result.message,
        request_payload: result.requestPayload || null,
        response_payload: result.responsePayload || { message: result.message, provider: result.provider },
        updated_at: new Date().toISOString()
      })
      .eq("id", document.id)
      .eq("company_id", profile.company_id);

    await supabase.from("nfse_events").insert({
      nfse_document_id: document.id,
      status: result.status,
      message: result.message,
      payload: result.responsePayload || result.requestPayload || {},
      created_by: profile.id
    });

    return redirectWithMessage(request, result.ok ? "processed" : "rejected", result.message);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na emissao fiscal.";
    if ((request.headers.get("content-type") || "").includes("form")) {
      return NextResponse.redirect(new URL(`/fiscal/emissao-nfse?status=error&message=${encodeURIComponent(message)}`, request.url), 303);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
