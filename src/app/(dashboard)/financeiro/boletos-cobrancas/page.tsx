import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ChargeRow = {
  id: string;
  external_id: string | null;
  status: string;
  financial_entries: {
    description: string;
    due_date: string;
    net_amount: number | string;
  } | {
    description: string;
    due_date: string;
    net_amount: number | string;
  }[] | null;
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getEntry(charge: ChargeRow) {
  return Array.isArray(charge.financial_entries) ? charge.financial_entries[0] : charge.financial_entries;
}

function getTone(status: string) {
  if (["paga", "conciliada"].includes(status)) return "success" as const;
  if (["solicitada", "emitida", "registrada", "aguardando_pagamento", "vencida", "erro_integracao"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function BoletosCobrancasPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const { data: charges } = profile?.company_id
    ? await supabase
      .from("boleto_charges")
      .select("id,external_id,status,financial_entries(description,due_date,net_amount)")
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [] };
  const allCharges = (charges || []) as ChargeRow[];

  return (
    <>
      <PageHeader
        area="Financeiro / Boletos e Cobrancas"
        title="Boletos e cobrancas"
        description="Cobrancas Banco Inter em sandbox por padrao, vinculadas a entradas financeiras."
      />
      <section className="table-panel">
        <h2>Cobrancas</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Entrada</th>
                <th>Identificador externo</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {allCharges.length ? (
                allCharges.map((charge) => {
                  const entry = getEntry(charge);
                  return (
                    <tr key={charge.id}>
                      <td>{entry?.description || "-"}</td>
                      <td>{charge.external_id || charge.id.slice(0, 8)}</td>
                      <td>{entry?.due_date ? formatDate(entry.due_date) : "-"}</td>
                      <td>{entry?.net_amount ? formatMoney(entry.net_amount) : "-"}</td>
                      <td><StatusBadge tone={getTone(charge.status)}>{charge.status}</StatusBadge></td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5}>Nenhuma cobrança cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
