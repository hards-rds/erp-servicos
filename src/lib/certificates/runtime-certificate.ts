import { extractPfxSigningMaterials } from "@/lib/certificates/pfx";
import { decryptCertificateSecret } from "@/lib/certificates/secrets";
import type { NfseRuntimeCertificate } from "@/lib/integrations/nfse-transport";
import { createServiceClient } from "@/lib/supabase/server";

type StoredCertificate = {
  id: string;
  label: string;
  encrypted_pfx: string;
  encrypted_password: string;
  valid_until: string | null;
  active: boolean;
  updated_at: string;
};

export type RuntimeCertificateStatus = {
  configured: boolean;
  usable: boolean;
  label?: string;
  validUntil?: string | null;
  updatedAt?: string;
  error?: string;
};

async function readActiveCertificate(companyId: string) {
  const service = createServiceClient();
  const { data, error } = await service
    .from("digital_certificates")
    .select("id,label,encrypted_pfx,encrypted_password,valid_until,active,updated_at")
    .eq("company_id", companyId)
    .eq("active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: data as StoredCertificate | null, error };
}

function openStoredCertificate(data: StoredCertificate) {
  const pfxBase64 = decryptCertificateSecret(data.encrypted_pfx);
  const password = decryptCertificateSecret(data.encrypted_password);
  const pfx = Buffer.from(pfxBase64, "base64");
  if (!pfx.length) throw new Error("O certificado digital armazenado esta vazio.");
  const materials = extractPfxSigningMaterials(pfx, password);
  return { pfx, password, materials };
}

export async function inspectRuntimeCertificate(companyId: string): Promise<RuntimeCertificateStatus> {
  const { data, error } = await readActiveCertificate(companyId);
  if (error) return { configured: false, usable: false, error: "Nao foi possivel consultar o certificado digital da empresa." };
  if (!data) return { configured: false, usable: false, error: "Certificado digital ativo nao encontrado para esta empresa." };

  const metadata = { label: data.label, validUntil: data.valid_until, updatedAt: data.updated_at };
  if (data.valid_until && new Date(`${data.valid_until}T23:59:59.999-03:00`) < new Date()) {
    return { configured: true, usable: false, ...metadata, error: "O certificado digital cadastrado esta expirado." };
  }

  try {
    openStoredCertificate(data);
    return { configured: true, usable: true, ...metadata };
  } catch (error) {
    return {
      configured: true,
      usable: false,
      ...metadata,
      error: error instanceof Error ? error.message : "Nao foi possivel abrir o certificado digital armazenado."
    };
  }
}

export async function loadRuntimeCertificate(companyId: string): Promise<{
  certificate?: NfseRuntimeCertificate;
  error?: string;
}> {
  if (process.env.NFSE_REAL_EMISSION !== "true") return {};

  const { data, error } = await readActiveCertificate(companyId);

  if (error) return { error: "Nao foi possivel consultar o certificado digital da empresa." };
  if (!data) return { error: "Certificado digital ativo nao encontrado para esta empresa." };
  if (data.valid_until && new Date(`${data.valid_until}T23:59:59.999-03:00`) < new Date()) {
    return { error: "O certificado digital cadastrado esta expirado." };
  }

  try {
    const { pfx, password, materials } = openStoredCertificate(data);

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
