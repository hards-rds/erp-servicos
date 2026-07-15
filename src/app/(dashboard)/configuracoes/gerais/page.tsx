import { PageHeader } from "@/components/layout/page-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type GeraisPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  saved: { kind: "success", text: "Configuracoes gerais salvas com sucesso." },
  invalid: { kind: "error", text: "Revise o nome da empresa e o segmento de atuacao." },
  forbidden: { kind: "error", text: "Apenas usuarios master podem alterar as configuracoes gerais." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." },
  error: { kind: "error", text: "Nao foi possivel salvar as configuracoes agora." }
};

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
    ? await supabase.from("companies").select("name,document,service_segment").eq("id", profile.company_id).maybeSingle()
    : { data: null };
  const isMaster = profile?.role === "master" && profile.active !== false;
  const message = params?.status ? statusMessages[params.status] : null;

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
            <select defaultValue="sandbox" disabled={!isMaster}>
              <option value="sandbox">Sandbox/Homologacao</option>
              <option value="production">Producao</option>
            </select>
          </label>
          <button className="primary-button" type="submit" disabled={!isMaster}>Salvar</button>
        </form>
      </section>
    </>
  );
}
