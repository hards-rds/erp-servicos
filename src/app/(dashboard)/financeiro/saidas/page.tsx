import { PageHeader } from "@/components/layout/page-header";
import { CreatePayableForm } from "@/components/finance/create-payable-form";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PayableRow = {
  id: string;
  vendor_name: string;
  category: string;
  description: string;
  competence: string;
  due_date: string;
  paid_at: string | null;
  amount: number | string;
  payment_method: string | null;
  status: string;
};

type SaidasPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

const statusMessages: Record<string, { kind: "success" | "error"; text: string }> = {
  created: { kind: "success", text: "Conta a pagar cadastrada com sucesso." },
  invalid: { kind: "error", text: "Revise os dados da conta, o valor e as datas informadas." },
  error: { kind: "error", text: "Nao foi possivel cadastrar a conta a pagar agora." },
  profile_error: { kind: "error", text: "Seu usuario ainda nao esta vinculado a uma empresa." }
};

function formatMoney(value: number | string) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("pt-BR");
}

function getTone(status: string) {
  if (["pago", "conciliado"].includes(status)) return "success" as const;
  if (["previsto", "aprovado", "vencido"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export default async function SaidasPage({ searchParams }: SaidasPageProps) {
  const params = await searchParams;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle()
    : { data: null };

  let payables: PayableRow[] = [];
  if (profile?.company_id) {
    const { data } = await supabase
      .from("payables")
      .select("id,vendor_name,category,description,competence,due_date,paid_at,amount,payment_method,status")
      .eq("company_id", profile.company_id)
      .order("due_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    payables = (data || []) as PayableRow[];
  }

  const message = params?.status
    ? statusMessages[params.status]
    : !profile?.company_id
      ? statusMessages.profile_error
      : null;

  return (
    <>
      <PageHeader
        area="Financeiro / Saidas"
        title="Saidas e contas a pagar"
        description="Despesas, fornecedores, aprovacao, pagamento e conciliacao."
        action={<CreatePayableForm />}
      />
      {message ? <div className={message.kind === "success" ? "form-success" : "form-error"}>{message.text}</div> : null}
      <section className="table-panel">
        <h2>Contas a pagar</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fornecedor</th>
                <th>Categoria</th>
                <th>Competencia</th>
                <th>Vencimento</th>
                <th>Valor</th>
                <th>Pagamento</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payables.length ? payables.map((payable) => (
                <tr key={payable.id}>
                  <td>
                    <strong>{payable.vendor_name}</strong>
                    <div className="muted">{payable.description}</div>
                  </td>
                  <td>{payable.category}</td>
                  <td>{payable.competence}</td>
                  <td>{formatDate(payable.due_date)}</td>
                  <td>{formatMoney(payable.amount)}</td>
                  <td>
                    {payable.paid_at ? (
                      <>
                        <strong>{formatDate(payable.paid_at)}</strong>
                        <div className="muted">{payable.payment_method || "-"}</div>
                      </>
                    ) : "-"}
                  </td>
                  <td><StatusBadge tone={getTone(payable.status)}>{payable.status}</StatusBadge></td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7}>Nenhuma saida cadastrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
