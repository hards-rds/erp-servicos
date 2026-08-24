import { InterChargeActions } from "@/components/finance/inter-charge-actions";
import { PageHeader } from "@/components/layout/page-header";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";

type PageProps = { searchParams?: Promise<{ status?: string }> };

type EntryRelation = { id: string; description: string; due_date: string; net_amount: number | string; clients: { legal_name: string } | { legal_name: string }[] | null };
type ChargeRow = {
  id: string;
  external_id: string | null;
  status: string;
  digitable_line: string | null;
  pix_qr_code: string | null;
  rejection_message: string | null;
  last_synced_at: string | null;
  financial_entries: EntryRelation | EntryRelation[] | null;
};
type EntryRow = { id: string; description: string; due_date: string; net_amount: number | string; status: string; clients: { legal_name: string } | { legal_name: string }[] | null };

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  issued: { kind: "success", text: "Cobranca enviada ao Banco Inter. Atualize para obter os dados processados." },
  synced: { kind: "success", text: "Situacao da cobranca atualizada no Banco Inter." },
  cancelled: { kind: "success", text: "Cobranca cancelada no Banco Inter." },
  inter_error: { kind: "error", text: "O Banco Inter recusou ou nao processou a operacao. Veja o erro na cobranca." },
  create_error: { kind: "error", text: "Nao foi possivel preparar a cobranca." },
  cancel_error: { kind: "error", text: "O Banco Inter nao confirmou o cancelamento." },
  cancel_invalid: { kind: "error", text: "Informe um motivo de cancelamento com pelo menos 5 caracteres." },
  invalid: { kind: "error", text: "Cobranca ou entrada financeira invalida." },
  profile_error: { kind: "error", text: "Seu usuario nao esta vinculado a uma empresa ativa." }
};

function relation<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] || null : value;
}

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string | null) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR") : "-";
}

function getTone(status: string) {
  if (["paga", "conciliada"].includes(status)) return "success" as const;
  if (["solicitada", "emitida", "registrada", "aguardando_pagamento", "vencida", "erro_integracao"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function BoletosCobrancasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const service = createServiceClient();
  const [{ data: charges }, { data: entries }, { data: interCredential }] = profile?.company_id
    ? await Promise.all([
      supabase.from("boleto_charges")
        .select("id,external_id,status,digitable_line,pix_qr_code,rejection_message,last_synced_at,financial_entries(id,description,due_date,net_amount,clients(legal_name))")
        .eq("company_id", profile.company_id).order("created_at", { ascending: false }).limit(100),
      supabase.from("financial_entries")
        .select("id,description,due_date,net_amount,status,clients(legal_name)")
        .eq("company_id", profile.company_id)
        .in("status", ["previsto", "emitido", "aguardando_pagamento", "vencido"])
        .order("due_date").limit(100),
      service.from("api_credentials").select("id,environment,last_test_status").eq("company_id", profile.company_id).eq("provider", "banco_inter").eq("active", true).maybeSingle()
    ])
    : [{ data: [] }, { data: [] }, { data: null }];
  const allCharges = (charges || []) as ChargeRow[];
  const chargedEntryIds = new Set(allCharges.map((charge) => relation(charge.financial_entries)?.id).filter(Boolean));
  const availableEntries = ((entries || []) as EntryRow[]).filter((entry) => !chargedEntryIds.has(entry.id));
  const message = params?.status ? messages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Financeiro / Boletos e Cobrancas"
        title="Boletos e cobrancas"
        description="Cobrancas Boleto com Pix, retorno bancario e baixa automatica pelo Banco Inter."
        action={<a className="ghost-button button-link" href="/configuracoes/apis">Configurar Inter</a>}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      {!interCredential ? <div className="form-error">Configure e ative o Banco Inter antes de emitir cobrancas.</div> : null}
      <section className="table-panel">
        <h2>Cobrancas</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente / entrada</th><th>Vencimento</th><th>Valor</th><th>Pagamento</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {allCharges.length ? allCharges.map((charge) => {
                const entry = relation(charge.financial_entries);
                const client = relation(entry?.clients || null);
                return (
                  <tr key={charge.id}>
                    <td>
                      <strong>{client?.legal_name || "Cliente"}</strong>
                      <div className="muted">{entry?.description || "-"}</div>
                      {charge.rejection_message ? <div className="form-error compact-message">{charge.rejection_message}</div> : null}
                    </td>
                    <td>{formatDate(entry?.due_date || null)}</td>
                    <td>{entry ? formatMoney(entry.net_amount) : "-"}</td>
                    <td>
                      <div className="muted">{charge.digitable_line || (charge.pix_qr_code ? "Pix disponivel" : "Aguardando processamento")}</div>
                    </td>
                    <td><StatusBadge tone={getTone(charge.status)}>{charge.status}</StatusBadge></td>
                    <td>
                      <InterChargeActions
                        chargeId={charge.id}
                        externalId={charge.external_id}
                        status={charge.status}
                        integrationConfigured={Boolean(interCredential)}
                      />
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={6}>Nenhuma cobranca cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      <section className="table-panel">
        <h2>Entradas sem cobranca</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Descricao</th><th>Vencimento</th><th>Valor</th><th>Acao</th></tr></thead>
            <tbody>
              {availableEntries.length ? availableEntries.map((entry) => {
                const client = relation(entry.clients);
                return (
                  <tr key={entry.id}>
                    <td>{client?.legal_name || "-"}</td><td>{entry.description}</td><td>{formatDate(entry.due_date)}</td><td>{formatMoney(entry.net_amount)}</td>
                    <td><RowActionsMenu label={`Acoes da entrada ${entry.description}`}><form action="/api/billing/inter/charges" method="post"><input type="hidden" name="action" value="create" /><input type="hidden" name="entryId" value={entry.id} /><button className="primary-button compact-button" type="submit" disabled={!interCredential}>Gerar cobranca</button></form></RowActionsMenu></td>
                  </tr>
                );
              }) : <tr><td colSpan={5}>Todas as entradas elegiveis ja possuem cobranca.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
