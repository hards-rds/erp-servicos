import { NextRequest, NextResponse } from "next/server";
import { classifyInterConnectionError } from "@/domains/billing/inter";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { configureInterWebhook, testInterConnection } from "@/lib/integrations/inter-client";
import {
  decryptInterCredentials,
  encryptInterCredentials,
  type InterEnvironment,
  type InterRuntimeCredentials
} from "@/lib/integrations/inter-credentials";
import { createServiceClient } from "@/lib/supabase/server";
import { tenantHasFeature } from "@/server/services/saas-plan-service";

export const runtime = "nodejs";

const maxCredentialFileBytes = 5 * 1024 * 1024;

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
  const access = await requireCompanyPermission({ module: "configuracoes.apis", action: "configurar", roles: ["master", "system_admin"] });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { profile } = access;
  if (!(await tenantHasFeature(profile.tenant_id, "api_integrations"))) return redirectWith(request, "plan_feature");

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
  const certificateCrt = formData.get("certificateCrt");
  const privateKey = formData.get("privateKey");
  const pfxFile = certificate instanceof File && certificate.size > 0 ? certificate : null;
  const crtFile = certificateCrt instanceof File && certificateCrt.size > 0 ? certificateCrt : null;
  const keyFile = privateKey instanceof File && privateKey.size > 0 ? privateKey : null;
  const credentialFiles = [pfxFile, crtFile, keyFile].filter((file): file is File => Boolean(file));
  if (credentialFiles.some((file) => file.size > maxCredentialFileBytes)) return redirectWith(request, "certificate_size");

  const hasPfxUpload = Boolean(pfxFile);
  const hasCrtUpload = Boolean(crtFile);
  const hasKeyUpload = Boolean(keyFile);
  if (hasPfxUpload && (hasCrtUpload || hasKeyUpload)) return redirectWith(request, "certificate_choice");
  if (hasCrtUpload !== hasKeyUpload) return redirectWith(request, "certificate_pair");

  const useNativeUpload = hasCrtUpload && hasKeyUpload;
  const pfxBase64 = hasPfxUpload
    ? Buffer.from(await (pfxFile as File).arrayBuffer()).toString("base64")
    : useNativeUpload ? undefined : previous?.pfxBase64;
  const certificateBase64 = useNativeUpload
    ? Buffer.from(await (crtFile as File).arrayBuffer()).toString("base64")
    : hasPfxUpload ? undefined : previous?.certificateBase64;
  const privateKeyBase64 = useNativeUpload
    ? Buffer.from(await (keyFile as File).arrayBuffer()).toString("base64")
    : hasPfxUpload ? undefined : previous?.privateKeyBase64;
  const clientId = readString(formData, "clientId") || previous?.clientId || "";
  const clientSecret = readSecret(formData, "clientSecret") || previous?.clientSecret || "";
  const passwordInput = readSecret(formData, "certificatePassword");
  const pfxPassword = credentialFiles.length ? passwordInput : passwordInput || previous?.pfxPassword || "";
  const accountNumber = readString(formData, "accountNumber") || previous?.accountNumber || "";
  const active = formData.get("active") === "on";
  const realChargesEnabled = environment === "production" && formData.get("realChargesEnabled") === "on";

  if (!clientId || !clientSecret || (!pfxBase64 && !(certificateBase64 && privateKeyBase64))) {
    return redirectWith(request, "invalid");
  }
  const credentials: InterRuntimeCredentials = {
    companyId: profile.company_id,
    environment,
    clientId,
    clientSecret,
    pfxBase64,
    pfxPassword,
    certificateBase64,
    privateKeyBase64,
    accountNumber: accountNumber || undefined,
    realChargesEnabled
  };

  try {
    await testInterConnection(credentials);
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Falha ao testar credenciais.";
    const failureStatus = classifyInterConnectionError(error);
    console.error("Banco Inter connection test failed", {
      companyId: profile.company_id,
      environment,
      failureStatus,
      message
    });
    if (existing?.id) {
      await service.from("api_credentials").update({
        last_tested_at: new Date().toISOString(),
        last_test_status: message,
        updated_at: new Date().toISOString()
      }).eq("id", existing.id).eq("company_id", profile.company_id);
    }
    return redirectWith(request, failureStatus);
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
      certificateBase64,
      privateKeyBase64,
      accountNumber: accountNumber || undefined,
      realChargesEnabled
    }),
    active: existing?.active === true,
    config_summary: {
      clientId,
      accountNumber: accountNumber || null,
      certificateName: useNativeUpload
        ? (crtFile as File).name
        : hasPfxUpload ? (pfxFile as File).name : "certificado configurado",
      privateKeyName: useNativeUpload ? (keyFile as File).name : null,
      credentialFormat: useNativeUpload ? "crt_key" : pfxBase64 ? "pfx" : "crt_key",
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

  await writeCompanyAudit({ companyId: profile.company_id, actorId: profile.id, entity: "api_credential", action: "configure_inter", metadata: { environment, active, realChargesEnabled } });

  return redirectWith(request, active ? "saved" : "saved_inactive");
}
