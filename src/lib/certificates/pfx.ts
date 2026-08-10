import forge from "node-forge";

export type ParsedPfx = {
  label: string;
  validUntil: string;
};

export class PfxValidationError extends Error {
  readonly code: "invalid_password" | "invalid_certificate";

  constructor(
    code: "invalid_password" | "invalid_certificate",
    message: string
  ) {
    super(message);
    this.name = "PfxValidationError";
    this.code = code;
  }
}

function isPasswordError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("invalid password") ||
    message.includes("mac could not be verified") ||
    message.includes("password was incorrect") ||
    message.includes("failed to decrypt")
  );
}

export function parsePfx(buffer: Buffer, password: string): ParsedPfx {
  try {
    const der = forge.util.createBuffer(buffer.toString("binary"));
    const asn1 = forge.asn1.fromDer(der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
    const certBagType = forge.pki.oids.certBag;
    const keyBagType = forge.pki.oids.keyBag;
    const shroudedKeyBagType = forge.pki.oids.pkcs8ShroudedKeyBag;
    const certificates = p12.getBags({ bagType: certBagType })[certBagType] ?? [];
    const keys = [
      ...(p12.getBags({ bagType: keyBagType })[keyBagType] ?? []),
      ...(p12.getBags({ bagType: shroudedKeyBagType })[shroudedKeyBagType] ?? [])
    ];

    if (!certificates.length || !keys.length) {
      throw new PfxValidationError(
        "invalid_certificate",
        "O arquivo precisa conter um certificado e sua chave privada."
      );
    }

    const certificateBag =
      certificates.find((bag) => {
        const constraints = bag.cert?.getExtension("basicConstraints") as { cA?: boolean } | undefined;
        return bag.cert && !constraints?.cA;
      }) ?? certificates[0];
    const certificate = certificateBag.cert;

    if (!certificate) {
      throw new PfxValidationError("invalid_certificate", "Certificado X.509 nao encontrado no arquivo.");
    }

    const validUntil = certificate.validity.notAfter;
    if (!(validUntil instanceof Date) || Number.isNaN(validUntil.getTime())) {
      throw new PfxValidationError("invalid_certificate", "Validade do certificado invalida.");
    }

    const commonName = certificate.subject.getField("CN")?.value;

    return {
      label: typeof commonName === "string" && commonName.trim() ? commonName.trim() : "Certificado A1",
      validUntil: validUntil.toISOString().slice(0, 10)
    };
  } catch (error) {
    if (error instanceof PfxValidationError) throw error;
    if (isPasswordError(error)) {
      throw new PfxValidationError("invalid_password", "A senha informada nao abriu o certificado.");
    }
    throw new PfxValidationError("invalid_certificate", "O arquivo nao e um certificado PFX/P12 valido.");
  }
}
