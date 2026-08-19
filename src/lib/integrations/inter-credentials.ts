import { decryptCertificateSecret, encryptCertificateSecret } from "@/lib/certificates/secrets";
import { createServiceClient } from "@/lib/supabase/server";

export type InterEnvironment = "sandbox" | "production";

export type InterRuntimeCredentials = {
  companyId: string;
  environment: InterEnvironment;
  clientId: string;
  clientSecret: string;
  pfxBase64?: string;
  pfxPassword: string;
  certificateBase64?: string;
  privateKeyBase64?: string;
  accountNumber?: string;
  realChargesEnabled: boolean;
};

type StoredInterCredentials = Omit<InterRuntimeCredentials, "companyId">;

export function encryptInterCredentials(credentials: StoredInterCredentials) {
  return encryptCertificateSecret(JSON.stringify(credentials));
}

export function decryptInterCredentials(companyId: string, encryptedPayload: string): InterRuntimeCredentials {
  const parsed = JSON.parse(decryptCertificateSecret(encryptedPayload)) as Partial<StoredInterCredentials>;
  if (
    !["sandbox", "production"].includes(String(parsed.environment))
    || !parsed.clientId
    || !parsed.clientSecret
    || (!parsed.pfxBase64 && !(parsed.certificateBase64 && parsed.privateKeyBase64))
  ) {
    throw new Error("Credenciais armazenadas do Banco Inter estao incompletas.");
  }

  return {
    companyId,
    environment: parsed.environment as InterEnvironment,
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
    pfxBase64: parsed.pfxBase64 || undefined,
    pfxPassword: parsed.pfxPassword || "",
    certificateBase64: parsed.certificateBase64 || undefined,
    privateKeyBase64: parsed.privateKeyBase64 || undefined,
    accountNumber: parsed.accountNumber || undefined,
    realChargesEnabled: parsed.realChargesEnabled === true
  };
}

export async function loadActiveInterCredentials(companyId: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("api_credentials")
    .select("encrypted_payload,environment")
    .eq("company_id", companyId)
    .eq("provider", "banco_inter")
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`Nao foi possivel carregar as credenciais do Banco Inter: ${error.message}`);
  if (!data?.encrypted_payload) throw new Error("Banco Inter nao configurado para esta empresa.");
  return decryptInterCredentials(companyId, data.encrypted_payload);
}
