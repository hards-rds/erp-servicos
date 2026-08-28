import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PageProps = { searchParams?: Promise<{ status?: string }> };

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  saved: { kind: "success", text: "PlanetChat conectada, token protegido e sincronizacao ativada." },
  saved_inactive: { kind: "success", text: "Token testado e protegido. A sincronizacao permanece inativa." },
  connection_forbidden: { kind: "error", text: "A PlanetChat recusou o token ou a permissao CUSTOMER_SERVICE_READ. Confirme o token com o suporte da PlanetChat." },
  connection_error: { kind: "error", text: "Nao foi possivel consultar a PlanetChat agora. Confira a disponibilidade da API e tente novamente." },
  invalid_token: { kind: "error", text: "Informe o token de integracao PlanetChat iniciado por intg_." },
  invalid: { kind: "error", text: "O periodo padrao deve ficar entre 1 e 90 dias." },
  forbidden: { kind: "error", text: "Apenas usuarios master podem configurar a PlanetChat." },
  segment_error: { kind: "error", text: "A integracao PlanetChat esta disponivel somente para empresas do segmento Tecnologia." },
  profile_error: { kind: "error", text: "Seu usuario nao esta ativo ou vinculado a uma empresa." },
  save_error: { kind: "error", text: "Nao foi possivel proteger e salvar a integracao PlanetChat." }
};

function summary(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("pt-BR") : "-";
}

export default async function PlanetChatSettingsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id,role,active").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("name,service_segment").eq("id", profile.company_id).maybeSingle()
    : { data: null };
  const { data: credential } = profile?.company_id
    ? await supabase.from("api_credentials")
      .select("active,config_summary,last_tested_at,last_test_status")
      .eq("company_id", profile.company_id)
      .eq("provider", "planetchat")
      .eq("environment", "production")
      .maybeSingle()
    : { data: null };
  const isMaster = Boolean(profile?.active && ["master", "system_admin"].includes(profile.role));
  const isTechnology = company?.service_segment === "tecnologia";
  const message = params?.status ? messages[params.status] : null;
  const config = credential?.config_summary as Record<string, unknown> | null;

  return (
    <>
      <PageHeader
        area="Configuracoes / APIs / PlanetChat"
        title="PlanetChat"
        description="Importe atendimentos do WhatsApp, eventos, tempos, qualificacoes e metricas por atendente."
        action={<a className="ghost-button button-link" href="/configuracoes/apis">Voltar para APIs</a>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      {!isTechnology ? <div className="form-error">Esta integracao so pode ser ativada em tenants de Tecnologia.</div> : null}
      <section className="table-panel">
        <h2>Situacao da integracao</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Empresa</th><th>Token</th><th>Ultimo teste</th><th>Ultima sincronizacao</th><th>Status</th></tr></thead>
            <tbody><tr>
              <td>{company?.name || "-"}</td>
              <td>{summary(config, "tokenEnding") ? `final ${summary(config, "tokenEnding")}` : "nao configurado"}</td>
              <td>{formatDate(credential?.last_tested_at)}</td>
              <td>{formatDate(summary(config, "lastSyncAt"))}</td>
              <td><StatusBadge tone={credential?.active ? "success" : "neutral"}>{credential?.active ? "ativa" : "inativa"}</StatusBadge></td>
            </tr></tbody>
          </table>
        </div>
      </section>
      <section className="form-panel">
        <h2>Credencial e sincronizacao</h2>
        {!isMaster ? <div className="form-error">Apenas usuarios master podem alterar esta integracao.</div> : null}
        <form className="form-stack" action="/api/configuracoes/apis/planetchat" method="post">
          <label>
            Token Bearer da PlanetChat
            <input name="token" type="password" autoComplete="new-password" placeholder={credential ? "Deixe vazio para manter o token atual" : "intg_..."} disabled={!isMaster || !isTechnology} />
          </label>
          <label>
            Periodo padrao de sincronizacao (dias)
            <input name="defaultSyncDays" type="number" min={1} max={90} defaultValue={summary(config, "defaultSyncDays") || "30"} required disabled={!isMaster || !isTechnology} />
          </label>
          <fieldset className="checkbox-panel">
            <legend>Ativacao</legend>
            <label className="checkbox-row"><input name="active" type="checkbox" defaultChecked={credential?.active === true} disabled={!isMaster || !isTechnology} /><span>Permitir sincronizacao dos chamados deste tenant</span></label>
          </fieldset>
          <button className="primary-button" type="submit" disabled={!isMaster || !isTechnology}>Testar, proteger e salvar</button>
        </form>
        <p className="muted">O token fica criptografado no servidor e nunca e exibido novamente. Solicite um token com CUSTOMER_SERVICE_READ ao suporte da PlanetChat.</p>
      </section>
    </>
  );
}
