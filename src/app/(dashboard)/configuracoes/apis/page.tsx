import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ApisPageProps = { searchParams?: Promise<{ status?: string }> };

type CredentialRow = {
  environment: string;
  active: boolean;
  config_summary: Record<string, unknown> | null;
  last_tested_at: string | null;
  last_test_status: string | null;
};

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  saved: { kind: "success", text: "Banco Inter conectado, credenciais protegidas e webhook configurado." },
  saved_inactive: { kind: "success", text: "Credenciais do Banco Inter testadas e protegidas. O ambiente permanece inativo." },
  webhook_error: { kind: "error", text: "As credenciais foram salvas, mas o Inter nao aceitou o webhook. Salve novamente para tentar." },
  connection_error: { kind: "error", text: "O Banco Inter recusou a conexao. Confira Client ID, Client Secret, certificado, senha e ambiente." },
  inter_pfx_password: { kind: "error", text: "Nao foi possivel abrir o PFX. Informe a mesma senha criada durante a conversao dos arquivos do Inter." },
  inter_pfx_invalid: { kind: "error", text: "O arquivo nao contem um certificado PFX valido com sua chave privada. Converta juntos o CRT e a KEY da mesma integracao Inter." },
  inter_credentials_environment: { kind: "error", text: "O Inter recusou as credenciais. Confirme Client ID, Client Secret e ambiente: credenciais de Producao nao funcionam no Sandbox." },
  inter_scope: { kind: "error", text: "A integracao Inter nao possui os escopos boleto-cobranca.read e boleto-cobranca.write. Habilite a API Cobranca no Internet Banking." },
  inter_unavailable: { kind: "error", text: "O Banco Inter esta indisponivel ou excedeu o tempo de resposta. Tente novamente em alguns minutos." },
  certificate_size: { kind: "error", text: "Cada arquivo de certificado deve ter no maximo 5 MB." },
  certificate_pair: { kind: "error", text: "Envie juntos o certificado CRT e a chave KEY fornecidos pelo Inter." },
  certificate_choice: { kind: "error", text: "Escolha apenas um formato: CRT com KEY ou um arquivo PFX/P12." },
  invalid: { kind: "error", text: "Preencha as credenciais e o certificado do Banco Inter." },
  forbidden: { kind: "error", text: "Apenas usuarios master podem configurar integracoes bancarias." },
  profile_error: { kind: "error", text: "Seu usuario nao esta vinculado a uma empresa." },
  save_error: { kind: "error", text: "Nao foi possivel proteger e salvar as credenciais." }
};

function summaryValue(row: CredentialRow | undefined, key: string) {
  const value = row?.config_summary?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function summaryBoolean(row: CredentialRow | undefined, key: string) {
  return row?.config_summary?.[key] === true;
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("pt-BR") : "-";
}

export default async function ApisPage({ searchParams }: ApisPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id,role,active").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: credentials } = profile?.company_id
    ? await supabase.from("api_credentials")
      .select("environment,active,config_summary,last_tested_at,last_test_status")
      .eq("company_id", profile.company_id)
      .eq("provider", "banco_inter")
      .order("environment")
    : { data: [] };
  const allCredentials = (credentials || []) as CredentialRow[];
  const sandbox = allCredentials.find((item) => item.environment === "sandbox");
  const production = allCredentials.find((item) => item.environment === "production");
  const message = params?.status ? messages[params.status] : null;
  const isMaster = Boolean(profile?.active && ["master", "system_admin"].includes(profile.role));

  return (
    <>
      <PageHeader
        area="Configuracoes / APIs"
        title="Integracoes"
        description="Conectores protegidos por empresa para atendimento, cobranca e automacoes."
        action={<a className="primary-button button-link" href="/configuracoes/apis/planetchat">Configurar PlanetChat</a>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="table-panel">
        <div className="table-panel-heading">
          <div>
            <h2>PlanetChat</h2>
            <span className="list-count">Atendimentos do WhatsApp, ordens de servico e metricas da equipe.</span>
          </div>
          <a className="ghost-button button-link" href="/configuracoes/apis/planetchat">Abrir configuracao</a>
        </div>
      </section>
      <section className="table-panel">
        <h2>Ambientes configurados</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Ambiente</th><th>Conta</th><th>Ultimo teste</th><th>Status</th><th>Ativo</th></tr></thead>
            <tbody>
              {[sandbox, production].map((row, index) => (
                <tr key={index}>
                  <td>{index === 0 ? "Sandbox" : "Producao"}</td>
                  <td>{summaryValue(row, "accountNumber") || "-"}</td>
                  <td>{formatDate(row?.last_tested_at || null)}</td>
                  <td><StatusBadge tone={row?.last_test_status === "conectado" ? "success" : "neutral"}>{row?.last_test_status || "nao configurado"}</StatusBadge></td>
                  <td>{row?.active ? "sim" : "nao"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {!isMaster ? <div className="form-error">Apenas usuarios master podem alterar as credenciais.</div> : null}
      {([sandbox, production] as Array<CredentialRow | undefined>).map((row, index) => {
        const environment = index === 0 ? "sandbox" : "production";
        return (
          <section className="form-panel" key={environment}>
            <h2>{environment === "sandbox" ? "Sandbox" : "Producao"}</h2>
            <form className="form-stack" action="/api/configuracoes/apis/inter" method="post" encType="multipart/form-data">
              <input type="hidden" name="environment" value={environment} />
              <div className="form-grid">
                <label>Conta corrente<input name="accountNumber" inputMode="numeric" placeholder="Somente numeros, com digito" defaultValue={summaryValue(row, "accountNumber")} disabled={!isMaster} /></label>
                <label>Client ID<input name="clientId" autoComplete="off" defaultValue={summaryValue(row, "clientId")} required disabled={!isMaster} /></label>
              </div>
              <div className="form-grid">
                <label>Client Secret<input name="clientSecret" type="password" autoComplete="new-password" placeholder="Deixe vazio para manter o atual" disabled={!isMaster} /></label>
                <label>Senha do PFX ou da chave<input name="certificatePassword" type="password" autoComplete="new-password" placeholder="Opcional para KEY sem senha" disabled={!isMaster} /></label>
              </div>
              <div className="form-grid">
                <label>Certificado original do Inter (.crt)<input name="certificateCrt" type="file" accept=".crt,.pem,application/x-x509-ca-cert" disabled={!isMaster} /></label>
                <label>Chave privada original do Inter (.key)<input name="privateKey" type="file" accept=".key,.pem" disabled={!isMaster} /></label>
              </div>
              <label>Alternativa: certificado convertido PFX/P12<input name="certificate" type="file" accept=".pfx,.p12" disabled={!isMaster} /></label>
              <fieldset className="checkbox-panel">
                <legend>Ativacao</legend>
                <label className="checkbox-row"><input type="checkbox" name="active" defaultChecked={row?.active || !allCredentials.length} disabled={!isMaster} /><span>Usar este ambiente nas novas cobrancas</span></label>
                {environment === "production" ? <label className="checkbox-row"><input type="checkbox" name="realChargesEnabled" defaultChecked={summaryBoolean(row, "realChargesEnabled")} disabled={!isMaster} /><span>Confirmo a emissao de cobrancas reais</span></label> : null}
              </fieldset>
              <button className="primary-button" type="submit" disabled={!isMaster}>Testar, proteger e salvar</button>
            </form>
          </section>
        );
      })}
    </>
  );
}
