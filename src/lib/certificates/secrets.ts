import crypto from "node:crypto";

export class CertificateSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CertificateSecretError";
  }
}

function encryptionKey() {
  const secret = process.env.CERTIFICATE_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new CertificateSecretError("Chave de criptografia do certificado nao configurada.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptCertificateSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

export function decryptCertificateSecret(value: string) {
  const [version, ivBase64, tagBase64, ciphertextBase64, ...extra] = value.split(":");
  if (version !== "v1" || !ivBase64 || !tagBase64 || !ciphertextBase64 || extra.length) {
    throw new CertificateSecretError("Formato do certificado armazenado e invalido.");
  }

  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(ivBase64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagBase64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextBase64, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch (error) {
    if (error instanceof CertificateSecretError) throw error;
    throw new CertificateSecretError(
      "Nao foi possivel abrir o certificado armazenado. Confira a chave CERTIFICATE_ENCRYPTION_KEY."
    );
  }
}
