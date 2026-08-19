import { NextRequest, NextResponse } from "next/server";
import { classifyInterConnectionError } from "@/domains/billing/inter";
import { configureInterWebhook, testInterConnection } from "@/lib/integrations/inter-client";
import {
  decryptInterCredentials,
  encryptInterCredentials,
  type InterEnvironment,
  type InterRuntimeCredentials
} from "@/lib/integrations/inter-credentials";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const maxPfxBytes = 5 * 1024 * 1024;

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function readSecret(formData: FormData, key: string) {
  return String(formData.get(key) || "");
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/configuracoes/apis?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id,role,active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.company_id) return redirectWith(request, "profile_error");
  if (!profile.active || !["master", "system_admin"].includes(profile.role)) return redirectWith(request, "forbidden");

  const formData = await request.formData();
  const environment = readString(formData, "environment") as InterEnvironment;
  if (!(["sandbox", "production"] as string[]).includes(environment)) return redirectWith(request, "invalid");

  const service = createServiceClient();
  const { data: existing } = await service
    .from("api_credentials")
    .select("id,encrypted_payload,active")
    .eq("company_id", profile.company_id)
    .eq("provider", "banco_inter")
    .eq("environment", environment)
    .maybeSingle();

  let previous: InterRuntimeCredentials | null = null;
  if (existing?.encrypted_payload) {
    try {
      previous = decryptInterCredentials(profile.company_id, existing.encrypted_payload);
    } catch {
      previous = null;
    }
  }

  const certificate = formData.get("certificate");
  if (certificate instanceof File && certificate.size > maxPfxBytes) return redirectWith(request, "certificate_size");
  const pfxBase64 = certificate instanceof File && certificate.size
    ? Buffer.from(await certificate.arrayBuffer()).toString("base64")
    : previous?.pfxBase64 || "";
  const clientId = readString(formData, "clientId") || previous?.clientId || "";
  const clientSecret = readSecret(formData, "clientSecret") || previous?.clientSecret || "";
  const pfxPassword = readSecret(formData, "certificatePassword") || previous?.pfxPassword || "";
  const accountNumber = readString(formData, "accountNumber") || previous?.accountNumber || "";
  const active = formData.get("active") === "on";
  const realChargesEnabled = environment === "production" && formData.get("realChargesEnabled") === "on";

  if (!clientId || !clientSecret || !pfxBase64) return redirectWith(request, "invalid");
  const credentials: InterRuntimeCredentials = {
    companyId: profile.company_id,
    environment,
    clientId,
    clientSecret,
    pfxBase64,
    pfxPassword,
    accountNumber: accountNumber || undefined,
    realChargesEnabled
  };

  try {
    await testInterConnection(credentials);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha ao testar credenciais.";
    if (existing?.id) {
      await service.from("api_credentials").update({
        last_tested_at: new Date().toISOString(),
        last_test_status: message,
        updated_at: new Date().toISOString()
      }).eq("id", existing.id).eq("company_id", profile.company_id);
    }
    return redirectWith(request, classifyInterConnectionError(error));
  }

  const webhookUrl = `${new URL(request.url).origin}/api/webhooks/inter/cobrancas`;
  const payload = {
    company_id: profile.company_id,
    provider: "banco_inter",
    environment,
    encrypted_payload: encryptInterCredentials({
      environment,
      clientId,
      clientSecret,
      pfxBase64,
      pfxPassword,
      accountNumber: accountNumber || undefined,
      realChargesEnabled
    }),
    active: existing?.active === true,
    config_summary: {
      clientId,
      accountNumber: accountNumber || null,
      certificateName: certificate instanceof File && certificate.size ? certificate.name : "certificado configurado",
      realChargesEnabled,
      webhookUrl
    },
    last_tested_at: new Date().toISOString(),
    last_test_status: "conectado",
    updated_at: new Date().toISOString()
  };

  const { error } = await service.from("api_credentials").upsert(payload, {
    onConflict: "company_id,provider,environment"
  });
  if (error) return redirectWith(request, "save_error");

  if (!active && existing?.active) {
    const { error: deactivateError } = await service.from("api_credentials")
      .update({ active: false, updated_at: new Date().toISOString() })
      .eq("company_id", profile.company_id)
      .eq("provider", "banco_inter")
      .eq("environment", environment);
    if (deactivateError) return redirectWith(request, "save_error");
  }

  if (active) {
    try {
      await configureInterWebhook(webhookUrl, credentials);
    } catch (error) {
      const message = error instanceof Error ? `Conectado; webhook pendente: ${error.message}` : "Conectado; webhook pendente.";
      await service.from("api_credentials").update({ last_test_status: message.slice(0, 500) })
        .eq("company_id", profile.company_id)
        .eq("provider", "banco_inter")
        .eq("environment", environment);
      return redirectWith(request, "webhook_error");
    }

    const { error: activateError } = await service.rpc("activate_api_credential", {
      p_company_id: profile.company_id,
      p_provider: "banco_inter",
      p_environment: environment
    });
    if (activateError) return redirectWith(request, "save_error");
  }

  return redirectWith(request, active ? "saved" : "saved_inactive");
}
