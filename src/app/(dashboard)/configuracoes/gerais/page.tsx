import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { inferTaxRegimeCode } from "@/domains/fiscal/ibs-cbs";

type GeraisPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  saved: { kind: "success", text: "Configuracoes gerais salvas com sucesso." },
  invalid: { kind: "error", text: "Revise o nome da empresa e o segmento de atuacao." },
  fiscal_invalid: { kind: "error", text: "Revise os dados fiscais do emitente, incluindo municipio, regime tributario, IBS, CBS e percentuais aproximados." },
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
  const isMaster = ["master", "system_admin"].includes(profile?.role || "") && profile?.active !== false;
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
              <option value="escola_futebol">Escola de futebol</option>
              <option value="transportadora">Transportadora</option>
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
            <div className="form-grid">
              <label>
                Tributos federais aproximados (%)
                <input
                  name="federalTotalTaxRate"
                  inputMode="decimal"
                  defaultValue={fiscalString(fiscalSettings, "federalTotalTaxRate", "13.45")}
                  placeholder="13,45"
                  required
                  disabled={!isMaster}
                />
              </label>
              <label>
                Tributos estaduais aproximados (%)
                <input
                  name="stateTotalTaxRate"
                  inputMode="decimal"
                  defaultValue={fiscalString(fiscalSettings, "stateTotalTaxRate", "0.00")}
                  placeholder="0,00"
                  required
                  disabled={!isMaster}
                />
              </label>
              <label>
                Tributos municipais aproximados (%)
                <input
                  name="municipalTotalTaxRate"
                  inputMode="decimal"
                  defaultValue={fiscalString(fiscalSettings, "municipalTotalTaxRate", "3.05")}
                  placeholder="3,05"
                  required
                  disabled={!isMaster}
                />
              </label>
            </div>
          </fieldset>
          <fieldset className="checkbox-panel">
            <legend>Reforma Tributaria (IBS/CBS)</legend>
            <p className="muted">Parametros do emitente aplicados aos novos grupos fiscais da NFS-e e do CT-e.</p>
            <div className="form-grid">
              <label>
                Codigo do regime tributario (CRT)
                <select name="taxRegimeCode" defaultValue={inferTaxRegimeCode(fiscalSettings)} required disabled={!isMaster}>
                  <option value="">Selecione</option>
                  <option value="1">1 - Simples Nacional</option>
                  <option value="2">2 - Simples Nacional, excesso de sublimite</option>
                  <option value="3">3 - Regime Normal</option>
                  <option value="4">4 - MEI</option>
                </select>
              </label>
              <label>
                IBS estadual (%)
                <input name="ibsStateRate" inputMode="decimal" defaultValue={fiscalString(fiscalSettings, "ibsStateRate", "0.10")} required disabled={!isMaster} />
              </label>
              <label>
                IBS municipal (%)
                <input name="ibsMunicipalRate" inputMode="decimal" defaultValue={fiscalString(fiscalSettings, "ibsMunicipalRate", "0.00")} required disabled={!isMaster} />
              </label>
              <label>
                CBS (%)
                <input name="cbsRate" inputMode="decimal" defaultValue={fiscalString(fiscalSettings, "cbsRate", "0.90")} required disabled={!isMaster} />
              </label>
            </div>
            <p className="muted">Aliquotas iniciais de 2026. Revise estes valores quando houver alteracao legal ou tratamento tributario especifico.</p>
          </fieldset>
          <button className="primary-button" type="submit" disabled={!isMaster}>Salvar</button>
        </form>
      </section>
    </>
  );
}
