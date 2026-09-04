function cleanFileNamePart(value: string, fallback: string, maxLength: number) {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.\s-]+|[.\s-]+$/g, "")
    .slice(0, maxLength);

  return cleaned || fallback;
}

function asciiFileName(fileName: string) {
  return fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-");
}

export function buildDanfseDownloadFileName(clientName: string | null | undefined, nfseNumber: string) {
  const client = cleanFileNamePart(clientName || "", "Cliente", 100);
  const number = cleanFileNamePart(nfseNumber, "sem-numero", 40);
  return `${client}-NFSe-${number}.pdf`;
}

export function buildAttachmentContentDisposition(fileName: string) {
  const fallback = asciiFileName(fileName) || "documento.pdf";
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
