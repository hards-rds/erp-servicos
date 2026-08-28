import { decryptCertificateSecret, encryptCertificateSecret } from "@/lib/certificates/secrets";
import { createServiceClient } from "@/lib/supabase/server";

export type PlanetChatRuntimeCredentials = {
  companyId: string;
  token: string;
  defaultSyncDays: number;
};

type StoredPlanetChatCredentials = Omit<PlanetChatRuntimeCredentials, "companyId">;

export function encryptPlanetChatCredentials(credentials: StoredPlanetChatCredentials) {
  return encryptCertificateSecret(JSON.stringify(credentials));
}

export function decryptPlanetChatCredentials(companyId: string, encryptedPayload: string): PlanetChatRuntimeCredentials {
  const parsed = JSON.parse(decryptCertificateSecret(encryptedPayload)) as Partial<StoredPlanetChatCredentials>;
  const defaultSyncDays = Number(parsed.defaultSyncDays || 30);
  if (!parsed.token || !parsed.token.startsWith("intg_") || !Number.isInteger(defaultSyncDays)) {
    throw new Error("Credenciais armazenadas da PlanetChat estao incompletas.");
  }

  return {
    companyId,
    token: parsed.token,
    defaultSyncDays: Math.min(90, Math.max(1, defaultSyncDays))
  };
}

export async function loadActivePlanetChatCredentials(companyId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("api_credentials")
    .select("encrypted_payload")
    .eq("company_id", companyId)
    .eq("provider", "planetchat")
    .eq("environment", "production")
    .eq("active", true)
    .maybeSingle();

  if (error) throw new Error(`Nao foi possivel carregar a integracao PlanetChat: ${error.message}`);
  if (!data?.encrypted_payload) throw new Error("PlanetChat nao configurada ou inativa para esta empresa.");
  return decryptPlanetChatCredentials(companyId, data.encrypted_payload);
}
