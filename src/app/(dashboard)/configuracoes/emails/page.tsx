import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type EmailsPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  saved: { kind: "success", text: "Configuracao de email salva." },
  invalid: { kind: "error", text: "Informe um remetente e um provedor valido." },
  error: { kind: "error", text: "Nao foi possivel salvar a configuracao." },
  forbidden: { kind: "error", text: "Apenas usuarios master podem configurar emails." },
  profile_error: { kind: "error", text: "Seu usuario nao esta ativo ou vinculado a uma empresa." }
};

export default async function EmailsPage({ searchParams }: EmailsPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: settings } = profile?.company_id
    ? await supabase
      .from("email_settings")
      .select("provider,email_from,reply_to")
      .eq("company_id", profile.company_id)
      .maybeSingle()
    : { data: null };
  const message = params?.status ? statusMessages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Configuracoes / E-mails"
        title="E-mails"
        description="Remetentes, templates, destinatarios padrao e historico de envio."
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>
          {message.text}
        </div>
      ) : null}
      <section className="form-panel">
        <h2>Configuracao</h2>
        <form className="form-stack" action="/api/configuracoes/emails" method="post">
          <label>
            Provedor
            <select name="provider" defaultValue={settings?.provider || process.env.EMAIL_PROVIDER || "resend"}>
              <option value="resend">Resend</option>
              <option value="sendgrid">SendGrid</option>
            </select>
          </label>
          <label>
            Remetente
            <input name="emailFrom" defaultValue={settings?.email_from || process.env.EMAIL_FROM || ""} placeholder="financeiro@empresa.com" />
          </label>
          <label>
            Responder para
            <input name="replyTo" defaultValue={settings?.reply_to || process.env.EMAIL_REPLY_TO || ""} placeholder="atendimento@empresa.com" />
          </label>
          <button className="primary-button" type="submit">Salvar</button>
        </form>
      </section>
    </>
  );
}
