import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CertificadoDigitalPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  saved: { kind: "success", text: "Certificado validado e cadastrado com sucesso." },
  missing: { kind: "error", text: "Selecione o arquivo PFX/P12 e informe a senha." },
  invalid_type: { kind: "error", text: "Envie um arquivo com extensao .pfx ou .p12." },
  too_large: { kind: "error", text: "O certificado deve ter no maximo 2 MB." },
  invalid_password: { kind: "error", text: "A senha informada nao abriu o certificado." },
  invalid_certificate: {
    kind: "error",
    text: "O arquivo nao foi reconhecido como um certificado A1 PFX/P12 valido. Exporte-o novamente com a chave privada."
  },
  expired: { kind: "error", text: "Este certificado esta vencido." },
  forbidden: { kind: "error", text: "Apenas usuarios master podem cadastrar certificados." },
  error: { kind: "error", text: "Nao foi possivel salvar o certificado agora." }
};

function formatDate(value?: string | null) {
  if (!value) return "sem validade informada";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

export default async function CertificadoDigitalPage({ searchParams }: CertificadoDigitalPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id,role,active").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: certificate } = profile?.company_id
    ? await supabase
        .from("digital_certificates")
        .select("label,valid_until,active,updated_at")
        .eq("company_id", profile.company_id)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };
  const isMaster = ["master", "system_admin"].includes(profile?.role || "") && profile?.active !== false;
  const message = params?.status ? statusMessages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Configuracoes / Certificado Digital"
        title="Certificado digital"
        description="Cadastro seguro de certificado A1/PFX, validade e uso restrito no servidor."
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}
      <section className="form-panel">
        <h2>Certificado atual</h2>
        <p>
          <StatusBadge tone={certificate ? "success" : "warning"}>
            {certificate ? "configurado" : "nao configurado"}
          </StatusBadge>
        </p>
        {certificate ? (
          <div className="summary-grid">
            <div>
              <span>Nome</span>
              <strong>{certificate.label}</strong>
            </div>
            <div>
              <span>Validade</span>
              <strong>{formatDate(certificate.valid_until)}</strong>
            </div>
          </div>
        ) : null}
        {!isMaster ? <div className="form-error">Apenas usuarios master podem cadastrar certificados.</div> : null}
        <form className="form-stack" action="/api/configuracoes/certificado-digital" method="post" encType="multipart/form-data">
          <label>
            Arquivo PFX
            <input name="certificate" type="file" accept=".pfx,.p12" required disabled={!isMaster} />
          </label>
          <label>
            Senha
            <input name="password" type="password" autoComplete="off" required disabled={!isMaster} />
          </label>
          <button className="primary-button" type="submit" disabled={!isMaster}>Validar em sandbox</button>
        </form>
      </section>
    </>
  );
}
