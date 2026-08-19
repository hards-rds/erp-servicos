import { gunzipSync } from "node:zlib";

function decodeCandidate(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (text.includes("<") && text.includes(">")) return text;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(text) || text.length < 80) return "";

  try {
    const content = Buffer.from(text.replace(/\s+/g, ""), "base64");
    const decoded = content[0] === 0x1f && content[1] === 0x8b
      ? gunzipSync(content).toString("utf8")
      : content.toString("utf8");
    return decoded.includes("<") && decoded.includes(">") ? decoded : "";
  } catch {
    return "";
  }
}

function collectXmlCandidates(value: unknown, output: string[], seen: Set<object>) {
  if (typeof value === "string") {
    const decoded = decodeCandidate(value);
    if (decoded) output.push(decoded);
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;

  seen.add(value);
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    collectXmlCandidates(item, output, seen);
  }
}

export function findAuthorizedNfseXml(payload: unknown) {
  const candidates: string[] = [];
  collectXmlCandidates(payload, candidates, new Set());
  return candidates.find((xml) => /<(?:\w+:)?NFSe[\s>]/i.test(xml)
    && /<(?:\w+:)?infNFSe[\s>]/i.test(xml)) || "";
}

