import { extractPfxSigningMaterials } from "@/lib/certificates/pfx";
import { decryptCertificateSecret } from "@/lib/certificates/secrets";
import type { NfseRuntimeCertificate } from "@/lib/integrations/nfse-transport";
import { createServiceClient } from "@/lib/supabase/server";

export async function loadRuntimeCertificate(companyId: string): Promise<{
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
