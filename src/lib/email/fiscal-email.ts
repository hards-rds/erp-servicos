import { createServiceClient } from "@/lib/supabase/server";

type Attachment = {
  filename: string;
  content: Buffer;
  contentType: string;
};

type EmailResult = {
  ok: boolean;
  provider: string;
  messageId?: string;
  error?: string;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

async function sendWithResend(options: {
  apiKey: string;
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  attachments: Attachment[];
}): Promise<EmailResult> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from: options.from,
      to: [options.to],
      reply_to: options.replyTo || undefined,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64")
      }))
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, provider: "resend", error: clean(payload.message) || `HTTP ${response.status}` };
  }
  return { ok: true, provider: "resend", messageId: clean(payload.id) };
}

async function sendWithSendGrid(options: {
  apiKey: string;
  from: string;
  replyTo?: string;
  to: string;
  subject: string;
  html: string;
  attachments: Attachment[];
}): Promise<EmailResult> {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: options.from },
      reply_to: options.replyTo ? { email: options.replyTo } : undefined,
      subject: options.subject,
      content: [{ type: "text/html", value: options.html }],
      attachments: options.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content.toString("base64"),
        type: attachment.contentType,
        disposition: "attachment"
      }))
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    return { ok: false, provider: "sendgrid", error: clean(payload.errors?.[0]?.message) || `HTTP ${response.status}` };
  }
  return { ok: true, provider: "sendgrid", messageId: response.headers.get("x-message-id") || undefined };
}

export async function sendFiscalDocumentEmail(options: {
  companyId: string;
  to: string;
  subject: string;
  html: string;
  attachments: Attachment[];
}) {
  const supabase = createServiceClient();
  const { data: settings } = await supabase
    .from("email_settings")
    .select("provider,email_from,reply_to")
    .eq("company_id", options.companyId)
    .maybeSingle();

  const provider = clean(settings?.provider || process.env.EMAIL_PROVIDER).toLowerCase();
  const from = clean(settings?.email_from || process.env.EMAIL_FROM);
  const replyTo = clean(settings?.reply_to || process.env.EMAIL_REPLY_TO);
  const apiKey = clean(process.env.EMAIL_API_KEY);

  if (!options.to) return { ok: false, provider: provider || "none", error: "Cliente sem email fiscal cadastrado." };
  if (!provider || !from || !apiKey) {
    return { ok: false, provider: provider || "none", error: "Envio de email nao configurado." };
  }

  if (provider === "resend") {
    return sendWithResend({ apiKey, from, replyTo, to: options.to, subject: options.subject, html: options.html, attachments: options.attachments });
  }
  if (provider === "sendgrid") {
    return sendWithSendGrid({ apiKey, from, replyTo, to: options.to, subject: options.subject, html: options.html, attachments: options.attachments });
  }

  return { ok: false, provider, error: "Provedor de email nao suportado. Use resend ou sendgrid." };
}

export async function logFiscalEmail(options: {
  companyId: string;
  recipient: string;
  subject: string;
  result: EmailResult;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createServiceClient();
  await supabase.from("email_logs").insert({
    company_id: options.companyId,
    recipient: options.recipient,
    subject: options.subject,
    status: options.result.ok ? "enviado" : "erro",
    provider_message_id: options.result.messageId || null,
    metadata: {
      provider: options.result.provider,
      error: options.result.error || null,
      ...(options.metadata || {})
    }
  });
}
