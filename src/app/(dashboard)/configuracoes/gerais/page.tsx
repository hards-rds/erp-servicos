import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type GeraisPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  saved: { kind: "success", text: "Configuracoes gerais salvas com sucesso." },
  invalid: { kind: "error", text: "Revise o nome da empresa e o segmento de atuacao." },
  fiscal_invalid: { kind: "error", text: "Revise os dados fiscais do emitente. Municipio, situacao tributaria e regime do Simples devem estar corretos." },
  forbidden: { kind: "error", text: "Apenas usuarios master podem alterar as configuracoes gerais." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  error: { kind: "error", text: "Nao foi possivel salvar as configuracoes agora." }
};

function fiscalString(data: Record<string, unknown> | null | undefined, key: string, fallback = "") {
  const value = data?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export default async function GeraisPage({ searchParams }: GeraisPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id,role,active").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("name,document,service_segment,fiscal_settings").eq("id", profile.company_id).maybeSingle()
    : { data: null };
  const isMaster = profile?.role === "master" && profile.active !== false;
  const message = params?.status ? statusMessages[params.status] : null;
  const fiscalSettings = company?.fiscal_settings as Record<string, unknown> | null | undefined;
  const fiscalEnvironment = process.env.NFSE_ENV === "production" ? "production" : "homologation";

  return (
    <>
      <PageHeader
        area="Configuracoes / Gerais"
        title="Configuracoes gerais"
        description="Parametros fiscais, financeiros, contas bancarias e preferencias do sistema."
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}
      <section className="form-panel">
        <h2>Empresa</h2>
        {!isMaster ? <div className="form-error">Apenas usuarios master podem alterar estas configuracoes.</div> : null}
        <form className="form-stack" action="/api/configuracoes/gerais" method="post">
          <label>
            Nome da empresa
            <input name="name" defaultValue={company?.name || ""} placeholder="Empresa de Servicos Ltda" required disabled={!isMaster} />
          </label>
          <label>
            CNPJ
            <input name="document" defaultValue={company?.document || ""} placeholder="00.000.000/0000-00" disabled={!isMaster} />
          </label>
          <label>
            Segmento de atuacao
            <select name="serviceSegment" defaultValue={company?.service_segment || "tecnologia"} disabled={!isMaster}>
              <option value="tecnologia">Tecnologia</option>
              <option value="otica">Otica</option>
              <option value="generico">Generico / outros servicos</option>
            </select>
          </label>
          <label>
            Ambiente fiscal
            <select defaultValue={fiscalEnvironment} disabled>
              <option value="homologation">Homologacao</option>
              <option value="production">Producao</option>
            </select>
          </label>
          <fieldset className="checkbox-panel">
            <legend>Emitente da NFS-e</legend>
            <div className="form-grid">
              <label>
                Codigo IBGE do municipio
                <input
                  name="fiscalCityCode"
                  inputMode="numeric"
                  maxLength={7}
                  defaultValue={fiscalString(fiscalSettings, "cityCode")}
                  placeholder="Ex.: 3170206"
                  required
                  disabled={!isMaster}
                />
              </label>
              <label>
                Inscricao municipal
                <input
                  name="municipalRegistration"
                  defaultValue={fiscalString(fiscalSettings, "municipalRegistration")}
                  disabled={!isMaster}
                />
              </label>
            </div>
            <div className="form-grid">
              <label>
                Serie da DPS
                <input name="dpsSeries" defaultValue={fiscalString(fiscalSettings, "series", "1")} required disabled={!isMaster} />
              </label>
              <label>
                Situacao do prestador no Simples Nacional
                <select name="simpleNationalStatus" defaultValue={fiscalString(fiscalSettings, "simpleNationalStatus")} required disabled={!isMaster}>
                  <option value="">Selecione</option>
                  <option value="1">Nao optante</option>
                  <option value="2">Optante - MEI</option>
                  <option value="3">Optante - ME/EPP</option>
                </select>
              </label>
            </div>
            <div className="form-grid">
              <label>
                Regime de apuracao do Simples Nacional
                <select name="simpleNationalAssessmentRegime" defaultValue={fiscalString(fiscalSettings, "simpleNationalAssessmentRegime")} disabled={!isMaster}>
                  <option value="">Nao se aplica</option>
                  <option value="1">Tributos federais e ISSQN pelo Simples Nacional</option>
                  <option value="2">Federais pelo Simples e ISSQN fora do Simples</option>
                  <option value="3">Tributos federais e ISSQN fora do Simples</option>
                </select>
              </label>
              <label>
                Regime especial de tributacao
                <select name="specialTaxRegime" defaultValue={fiscalString(fiscalSettings, "specialTaxRegime", "0")} disabled={!isMaster}>
                  <option value="0">Nenhum</option>
                  <option value="1">Ato cooperado</option>
                  <option value="2">Estimativa</option>
                  <option value="3">Microempresa municipal</option>
                  <option value="4">Notario ou registrador</option>
                  <option value="5">Profissional autonomo</option>
                  <option value="6">Sociedade de profissionais</option>
                  <option value="9">Outros</option>
                </select>
              </label>
            </div>
          </fieldset>
          <button className="primary-button" type="submit" disabled={!isMaster}>Salvar</button>
        </form>
      </section>
    </>
  );
}
