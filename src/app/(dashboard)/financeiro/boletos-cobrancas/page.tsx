import { InterChargeActions } from "@/components/finance/inter-charge-actions";
import { PageHeader } from "@/components/layout/page-header";
import { RowActionsMenu } from "@/components/ui/row-actions-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { CompetenceFilter } from "@/components/ui/competence-filter";
import { resolveCompetence } from "@/lib/dates/competence";
import { mapInterChargeStatus } from "@/domains/billing/inter";
import type { InterListedCharge } from "@/lib/integrations/inter-client";
import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { listStoredInterCharges } from "@/server/services/inter-charge-service";

type PageProps = { searchParams?: Promise<{ status?: string; competence?: string; inter?: string }> };

type ClientRelation = { legal_name: string; document: string | null };
type EntryRelation = { id: string; description: string; competence: string; due_date: string; net_amount: number | string; clients: ClientRelation | ClientRelation[] | null };
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
type EntryRow = { id: string; description: string; due_date: string; net_amount: number | string; status: string; clients: ClientRelation | ClientRelation[] | null };

const messages: Record<string, { kind: "success" | "error"; text: string }> = {
  issued: { kind: "success", text: "Cobranca enviada ao Banco Inter. Atualize para obter os dados processados." },
  synced: { kind: "success", text: "Situacao da cobranca atualizada no Banco Inter." },
  cancelled: { kind: "success", text: "Cobranca cancelada no Banco Inter." },
  inter_error: { kind: "error", text: "O Banco Inter recusou ou nao processou a operacao. Veja o erro na cobranca." },
  create_error: { kind: "error", text: "Nao foi possivel preparar a cobranca." },
  cancel_error: { kind: "error", text: "O Banco Inter nao confirmou o cancelamento." },
  cancel_invalid: { kind: "error", text: "Informe um motivo de cancelamento com pelo menos 5 caracteres." },
  invalid: { kind: "error", text: "Cobranca ou entrada financeira invalida." },
  plan_feature: { kind: "error", text: "Novas cobrancas integradas exigem o plano Pro ou Enterprise." },
  profile_error: { kind: "error", text: "Seu usuario nao esta vinculado a uma empresa ativa." },
  imported: { kind: "success", text: "Cobranca do Inter vinculada e situacao financeira atualizada." },
  import_error: { kind: "error", text: "Nao foi possivel vincular a cobranca. Atualize a consulta e tente novamente." },
  import_invalid: { kind: "error", text: "Selecione uma entrada financeira para vincular a cobranca." }
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

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function monthRange(competence: string) {
  const [year, month] = competence.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${competence}-01`, to: `${competence}-${String(lastDay).padStart(2, "0")}` };
}

function suggestedEntry(charge: InterListedCharge, entries: EntryRow[]) {
  const chargeAmount = Math.round(charge.amount * 100);
  const candidates = entries.map((entry) => {
    const client = relation(entry.clients);
    let score = 0;
    if (charge.payerDocument && onlyDigits(client?.document) === charge.payerDocument) score += 4;
    if (Math.round(Number(entry.net_amount) * 100) === chargeAmount) score += 3;
    if (entry.due_date === charge.dueDate) score += 2;
    return { entry, score };
  }).filter((candidate) => candidate.score >= 5).sort((left, right) => right.score - left.score);
  return candidates.length === 1 || (candidates[0] && candidates[0].score > (candidates[1]?.score || 0))
    ? candidates[0]?.entry.id || ""
    : "";
}

export default async function BoletosCobrancasPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const competence = resolveCompetence(params?.competence);
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const service = createServiceClient();
  const [{ data: charges }, { data: entries }, { data: interCredential }] = profile?.company_id
    ? await Promise.all([
      supabase.from("boleto_charges")
        .select("id,external_id,status,digitable_line,pix_qr_code,rejection_message,last_synced_at,financial_entries!inner(id,description,competence,due_date,net_amount,clients(legal_name,document))")
        .eq("company_id", profile.company_id).eq("financial_entries.competence", competence).order("created_at", { ascending: false }).limit(500),
      supabase.from("financial_entries")
        .select("id,description,due_date,net_amount,status,clients(legal_name,document)")
        .eq("company_id", profile.company_id)
        .eq("competence", competence)
        .neq("status", "cancelado")
        .order("due_date").limit(1000),
      service.from("api_credentials").select("id,environment,last_test_status").eq("company_id", profile.company_id).eq("provider", "banco_inter").eq("active", true).maybeSingle()
    ])
    : [{ data: [] }, { data: [] }, { data: null }];
  const allCharges = (charges || []) as ChargeRow[];
  const chargedEntryIds = new Set(allCharges.map((charge) => relation(charge.financial_entries)?.id).filter(Boolean));
  const allEntries = (entries || []) as EntryRow[];
  const availableEntries = allEntries.filter((entry) =>
    !chargedEntryIds.has(entry.id) && !["recebido", "conciliado"].includes(entry.status)
  );
  const importEntries = allEntries.filter((entry) => !chargedEntryIds.has(entry.id));
  const linkedExternalIds = new Set(allCharges.map((charge) => charge.external_id).filter(Boolean));
  let interCharges: InterListedCharge[] | null = null;
  let interError = "";
  if (params?.inter === "1" && profile?.company_id && interCredential) {
    try {
      const range = monthRange(competence);
      interCharges = await listStoredInterCharges(profile.company_id, range.from, range.to);
    } catch (error) {
      interError = error instanceof Error ? error.message : "Falha ao consultar cobrancas no Banco Inter.";
    }
  }
  const unlinkedInterCharges = (interCharges || []).filter((charge) => !linkedExternalIds.has(charge.externalId));
  const message = params?.status ? messages[params.status] : null;

  return (
    <>
      <PageHeader
        area="Financeiro / Boletos e Cobrancas"
        title="Boletos e cobrancas"
        description="Cobrancas Boleto com Pix, retorno bancario e baixa automatica pelo Banco Inter."
        action={<a className="ghost-button button-link" href="/configuracoes/apis">Configurar Inter</a>}
      />
      <CompetenceFilter value={competence} pathname="/financeiro/boletos-cobrancas" />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      {!interCredential ? <div className="form-error">Configure e ative o Banco Inter antes de emitir cobrancas.</div> : null}
      <section className="table-panel">
        <div className="table-panel-heading">
          <div>
            <h2>Sincronizacao inicial</h2>
            <span className="muted">Consulte os boletos ja emitidos no Inter e confirme o vinculo com uma entrada financeira.</span>
          </div>
          <form method="get">
            <input type="hidden" name="competence" value={competence} />
            <input type="hidden" name="inter" value="1" />
            <button className="ghost-button" type="submit" disabled={!interCredential}>Buscar no Inter</button>
          </form>
        </div>
        {interError ? <div className="form-error">Banco Inter: {interError}</div> : null}
        {interCharges ? (
          <>
            <p className="muted">{interCharges.length} cobranca(s) encontrada(s); {unlinkedInterCharges.length} aguardando vinculo.</p>
            <div className="table-wrap">
              <table className="table-adaptive-fit">
                <thead><tr><th>Pagador</th><th>Vencimento</th><th>Valor</th><th>Status Inter</th><th>Vincular entrada</th></tr></thead>
                <tbody>
                  {unlinkedInterCharges.length ? unlinkedInterCharges.map((charge) => {
                    const suggestion = suggestedEntry(charge, importEntries);
                    return (
                      <tr key={charge.externalId}>
                        <td><strong>{charge.payerName || "Pagador"}</strong><div className="muted">{charge.payerDocument || "Documento nao informado"}</div></td>
                        <td>{formatDate(charge.dueDate)}</td>
                        <td>{formatMoney(charge.amount)}</td>
                        <td><StatusBadge tone={getTone(mapInterChargeStatus(charge.situation))}>{charge.situation || "-"}</StatusBadge></td>
                        <td>
                          <form className="inter-link-form" action="/api/billing/inter/import" method="post">
                            <input type="hidden" name="externalId" value={charge.externalId} />
                            <input type="hidden" name="competence" value={competence} />
                            <select name="entryId" defaultValue={suggestion} required aria-label={`Entrada para ${charge.payerName || "pagador"}`}>
                              <option value="">Selecione a entrada</option>
                              {importEntries.map((entry) => {
                                const client = relation(entry.clients);
                                return <option key={entry.id} value={entry.id}>{client?.legal_name || "Cliente"} - {formatMoney(entry.net_amount)} - {formatDate(entry.due_date)}</option>;
                              })}
                            </select>
                            <button className="primary-button compact-button" type="submit">Vincular</button>
                          </form>
                        </td>
                      </tr>
                    );
                  }) : <tr><td colSpan={5}>Todas as cobrancas encontradas ja estao vinculadas.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : <p className="muted">A consulta nao emite, altera ou cancela boletos.</p>}
      </section>
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
