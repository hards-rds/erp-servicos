import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

type ContratosPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

type ContractRow = {
  id: string;
  client_id: string;
  service_description: string;
  recurring_amount: number | string;
  periodicity: string;
  due_day: number;
  starts_at: string;
  status: string;
  fiscal_service_data: Record<string, unknown> | null;
  notes: string | null;
  clients: { legal_name: string } | { legal_name: string }[] | null;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Contrato cadastrado com sucesso." },
  updated: { kind: "success", text: "Contrato atualizado. A nota rejeitada ja pode ser processada novamente." },
  charge_issued: { kind: "success", text: "Cobranca enviada ao Banco Inter para processamento." },
  charge_error: { kind: "error", text: "O Banco Inter nao processou a cobranca. Consulte Boletos/Cobrancas." },
  inter_inactive: { kind: "error", text: "Banco Inter inativo. A emissao fiscal continua disponivel normalmente." },
  generate_error: { kind: "error", text: "Nao foi possivel preparar o lancamento desta competencia." },
  inactive: { kind: "error", text: "Somente contratos ativos geram fluxo recorrente." },
  fiscal_invalid: {
    kind: "error",
    text: "Para emitir NFS-e, informe o codigo nacional do servico com 6 digitos."
  },
  invalid: { kind: "error", text: "Revise cliente, servico, valor e dia de vencimento." },
  error: { kind: "error", text: "Nao foi possivel cadastrar o contrato agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getClientName(contract: ContractRow) {
  const client = Array.isArray(contract.clients) ? contract.clients[0] : contract.clients;
  return client?.legal_name || "-";
}

export default async function ContratosPage({ searchParams }: ContratosPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: company } = profile?.company_id
    ? await supabase.from("companies").select("service_segment").eq("id", profile.company_id).maybeSingle()
    : { data: null };

  if (company?.service_segment === "otica") {
    return (
      <>
        <PageHeader
          area="Cadastros / Contratos"
          title="Contratos indisponiveis"
          description="Para oticas, o fluxo principal fica em vendas, estoque, clientes e servicos pontuais."
          action={<a className="primary-button button-link" href="/operacao/vendas">Ir para vendas</a>}
        />
        <section className="form-panel">
          <h2>Modulo oculto para oticas</h2>
          <p className="muted">
            Este ambiente esta configurado como otica, entao contratos recorrentes foram removidos da operacao diaria.
          </p>
        </section>
      </>
    );
  }

  const service = createServiceClient();
  const [{ data: contracts }, { data: interCredential }] = profile?.company_id
    ? await Promise.all([
      supabase
        .from("contracts")
        .select("id,client_id,service_description,recurring_amount,periodicity,due_day,starts_at,status,fiscal_service_data,notes,clients(legal_name)")
        .eq("company_id", profile.company_id)
        .order("created_at", { ascending: false })
        .limit(50),
      service.from("api_credentials")
        .select("id")
        .eq("company_id", profile.company_id)
        .eq("provider", "banco_inter")
        .eq("active", true)
        .maybeSingle()
    ])
    : [{ data: [] }, { data: null }];
  const allContracts = (contracts || []) as ContractRow[];
  const message = params?.status ? statusMessages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Cadastros / Contratos"
        title="Contratos recorrentes"
        description="Cadastre a recorrencia e emita NFS-e ou boleto separadamente em cada competencia."
        action={<a className="primary-button button-link" href="/cadastros/contratos/novo">Novo contrato</a>}
      />
      {message ? (
        <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div>
      ) : null}
      <section className="table-panel">
          <h2>Contratos</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Servico</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {allContracts.length ? (
                  allContracts.map((contract) => (
                    <tr key={contract.id}>
                      <td>{getClientName(contract)}</td>
                      <td>{contract.service_description}</td>
                      <td>{formatMoney(contract.recurring_amount)}</td>
                      <td>Dia {contract.due_day}</td>
                      <td><StatusBadge tone={contract.status === "ativo" ? "success" : "neutral"}>{contract.status}</StatusBadge></td>
                      <td>
                        <RowActionsMenu label={`Acoes do contrato de ${getClientName(contract)}`}>
                          <a
                            className="ghost-button button-link compact-button"
                            href={`/cadastros/contratos/${contract.id}/editar`}
                          >
                            Editar
                          </a>
                          <form action="/api/cadastros/contratos" method="post">
                            <input type="hidden" name="action" value="issue_nfse" />
                            <input type="hidden" name="contractId" value={contract.id} />
                            <button className="primary-button compact-button" type="submit" disabled={contract.status !== "ativo"}>Emitir NFS-e</button>
                          </form>
                          <form action="/api/cadastros/contratos" method="post">
                            <input type="hidden" name="action" value="issue_charge" />
                            <input type="hidden" name="contractId" value={contract.id} />
                            <button
                              className="ghost-button compact-button"
                              type="submit"
                              disabled={contract.status !== "ativo" || !interCredential}
                              title={!interCredential ? "Banco Inter inativo" : "Emitir boleto Banco Inter"}
                            >
                              Emitir boleto
                            </button>
                          </form>
                        </RowActionsMenu>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>Nenhum contrato cadastrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </section>
    </>
  );
}
