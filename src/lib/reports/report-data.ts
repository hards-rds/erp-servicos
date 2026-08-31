import { createServerSupabaseClient, createServiceClient } from "@/lib/supabase/server";
import { fetchAllReportRows } from "@/lib/reports/fetch-all";
import type { ReportFilters, ReportResult } from "@/lib/reports/types";

type RelatedClient = { legal_name: string } | Array<{ legal_name: string }> | null;
type EyeData = {
  sphere?: string | null;
  cylinder?: string | null;
  axis?: string | null;
  addition?: string | null;
  pd?: string | null;
};
type ClinicalData = {
  addition?: string | null;
  baseCurve?: string | null;
  complaint?: string | null;
  lensType?: string | null;
  binocularPd?: string | null;
  frameNotes?: string | null;
};

function formatMoney(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(value: number | string | null | undefined, maximumFractionDigits = 2) {
  return Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");
}

function labelStatus(value: string) {
  return value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function clientName(value: RelatedClient) {
  const client = Array.isArray(value) ? value[0] : value;
  return client?.legal_name || "-";
}

function formatEye(eye: EyeData | null) {
  if (!eye) return "-";
  const values = [
    eye.sphere ? `Esf. ${eye.sphere}` : "",
    eye.cylinder ? `Cil. ${eye.cylinder}` : "",
    eye.axis ? `Eixo ${eye.axis}` : "",
    eye.addition ? `Ad. ${eye.addition}` : "",
    eye.pd ? `DNP ${eye.pd}` : ""
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "-";
}

function formatClinical(clinical: ClinicalData | null, notes: string | null) {
  const values = [
    clinical?.complaint || "",
    clinical?.lensType ? `Lente: ${clinical.lensType}` : "",
    clinical?.binocularPd ? `DP: ${clinical.binocularPd}` : "",
    clinical?.baseCurve ? `Curva base: ${clinical.baseCurve}` : "",
    clinical?.frameNotes ? `Armacao: ${clinical.frameNotes}` : "",
    notes || ""
  ].filter(Boolean);
  return values.length ? values.join(" · ") : "-";
}

function searchRows<T>(rows: T[], search: string, values: (row: T) => Array<unknown>) {
  if (!search) return rows;
  const needle = search.toLocaleLowerCase("pt-BR");
  return rows.filter((row) => values(row).join(" ").toLocaleLowerCase("pt-BR").includes(needle));
}

function dateInRange(value: string | null | undefined, filters: ReportFilters) {
  const date = value?.slice(0, 10);
  return Boolean(date && date >= filters.from && date <= filters.to);
}

async function getReportContext() {
  const authClient = await createServerSupabaseClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) throw new Error("Usuario nao autenticado.");

  const { data: profile, error } = await authClient
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile?.company_id) throw error || new Error("Empresa ativa nao encontrada.");

  return { supabase: createServiceClient(), companyId: profile.company_id as string };
}

async function financialReport(filters: ReportFilters): Promise<ReportResult> {
  type Row = {
    id: string;
    description: string;
    type: string;
    competence: string;
    due_date: string;
    received_at: string | null;
    received_amount: number | string | null;
    net_amount: number | string;
    payment_method: string | null;
    status: string;
    clients: RelatedClient;
  };

  const { supabase, companyId } = await getReportContext();
  const data = await fetchAllReportRows<Row>((from, to) => {
    let query = supabase
      .from("financial_entries")
      .select("id,description,type,competence,due_date,received_at,received_amount,net_amount,payment_method,status,clients(legal_name)")
      .eq("company_id", companyId)
      .gte("due_date", filters.from)
      .lte("due_date", filters.to)
      .order("due_date", { ascending: false })
      .order("id");
    if (filters.status) query = query.eq("status", filters.status);
    return query.range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
  const rows = searchRows(data, filters.search, (row) => [row.description, row.type, row.competence, row.status, clientName(row.clients)]);
  const active = rows.filter((row) => row.status !== "cancelado");
  const received = rows.filter((row) => ["recebido", "conciliado"].includes(row.status));
  const open = rows.filter((row) => !["recebido", "conciliado", "cancelado"].includes(row.status));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = open.filter((row) => row.status === "vencido" || row.due_date < today);

  return {
    title: "Contas a receber",
    description: "Lancamentos, vencimentos, recebimentos e formas de pagamento.",
    dateFieldLabel: "Vencimento",
    metrics: [
      { label: "Total lancado", value: formatMoney(active.reduce((sum, row) => sum + Number(row.net_amount), 0)), detail: `${active.length} lancamentos` },
      { label: "Total recebido", value: formatMoney(received.reduce((sum, row) => sum + Number(row.received_amount || row.net_amount), 0)), detail: `${received.length} baixas` },
      { label: "Em aberto", value: formatMoney(open.reduce((sum, row) => sum + Number(row.net_amount), 0)), detail: `${open.length} pendencias` },
      { label: "Vencidos", value: formatMoney(overdue.reduce((sum, row) => sum + Number(row.net_amount), 0)), detail: `${overdue.length} lancamentos` }
    ],
    columns: [
      { key: "dueDate", label: "Vencimento" },
      { key: "description", label: "Descricao" },
      { key: "client", label: "Cliente" },
      { key: "type", label: "Tipo" },
      { key: "competence", label: "Competencia" },
      { key: "amount", label: "Valor", align: "right" },
      { key: "received", label: "Recebido", align: "right" },
      { key: "method", label: "Forma" },
      { key: "status", label: "Status" }
    ],
    rows: rows.map((row) => ({
      dueDate: formatDate(row.due_date),
      description: row.description,
      client: clientName(row.clients),
      type: labelStatus(row.type),
      competence: row.competence,
      amount: formatMoney(row.net_amount),
      received: row.received_at ? formatMoney(row.received_amount || row.net_amount) : "-",
      method: row.payment_method ? labelStatus(row.payment_method) : "-",
      status: labelStatus(row.status)
    }))
  };
}

async function salesReport(filters: ReportFilters): Promise<ReportResult> {
  type Row = {
    id: string;
    sale_date: string;
    description: string;
    gross_amount: number | string;
    discount_amount: number | string;
    net_amount: number | string;
    payment_method: string | null;
    status: string;
    clients: RelatedClient;
  };

  const { supabase, companyId } = await getReportContext();
  const data = await fetchAllReportRows<Row>((from, to) => {
    let query = supabase
      .from("sales")
      .select("id,sale_date,description,gross_amount,discount_amount,net_amount,payment_method,status,clients(legal_name)")
      .eq("company_id", companyId)
      .gte("sale_date", filters.from)
      .lte("sale_date", filters.to)
      .order("sale_date", { ascending: false })
      .order("id");
    if (filters.status) query = query.eq("status", filters.status);
    return query.range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
  const rows = searchRows(data, filters.search, (row) => [row.description, row.status, row.payment_method, clientName(row.clients)]);
  const valid = rows.filter((row) => row.status !== "cancelada");
  const received = valid.filter((row) => row.status === "recebida");
  const total = valid.reduce((sum, row) => sum + Number(row.net_amount), 0);

  return {
    title: "Vendas",
    description: "Faturamento por cliente, situacao e forma de pagamento.",
    dateFieldLabel: "Data da venda",
    metrics: [
      { label: "Vendas no periodo", value: formatMoney(total), detail: `${valid.length} vendas` },
      { label: "Recebidas", value: formatMoney(received.reduce((sum, row) => sum + Number(row.net_amount), 0)), detail: `${received.length} vendas` },
      { label: "Descontos", value: formatMoney(valid.reduce((sum, row) => sum + Number(row.discount_amount), 0)) },
      { label: "Ticket medio", value: formatMoney(valid.length ? total / valid.length : 0) }
    ],
    columns: [
      { key: "date", label: "Data" },
      { key: "description", label: "Venda" },
      { key: "client", label: "Cliente" },
      { key: "gross", label: "Bruto", align: "right" },
      { key: "discount", label: "Desconto", align: "right" },
      { key: "net", label: "Liquido", align: "right" },
      { key: "method", label: "Forma" },
      { key: "status", label: "Status" }
    ],
    rows: rows.map((row) => ({
      date: formatDate(row.sale_date),
      description: row.description,
      client: clientName(row.clients),
      gross: formatMoney(row.gross_amount),
      discount: formatMoney(row.discount_amount),
      net: formatMoney(row.net_amount),
      method: row.payment_method ? labelStatus(row.payment_method) : "-",
      status: labelStatus(row.status)
    }))
  };
}

async function payablesReport(filters: ReportFilters): Promise<ReportResult> {
  type Row = {
    id: string;
    origin: string;
    vendor_name: string;
    category: string;
    description: string;
    competence: string;
    due_date: string;
    paid_at: string | null;
    amount: number | string;
    payment_method: string | null;
    status: string;
    created_at: string;
    installment_number?: number | null;
    installment_total?: number | null;
    payable_series?: { kind: "installment" | "fixed" } | Array<{ kind: "installment" | "fixed" }> | null;
  };
  type CommissionRow = {
    id: string;
    description: string;
    reference_date: string;
    due_date: string;
    commission_amount: number | string;
    status: string;
    payable_id: string | null;
    created_at: string;
    seller: { name: string; email: string | null } | Array<{ name: string; email: string | null }> | null;
  };
  type BankRow = {
    id: string;
    transaction_date: string;
    description: string | null;
    amount: number | string;
    created_at: string;
    bank_accounts: { bank_name: string } | Array<{ bank_name: string }> | null;
  };
  type ReconciliationRow = { bank_transaction_id: string; payable_id: string | null };

  const { supabase, companyId } = await getReportContext();
  const includeCommissions = !filters.status || filters.status === "previsto";
  const includeBankTransactions = !filters.status || ["pago", "conciliado"].includes(filters.status);
  const [payablesData, commissionsData, bankTransactionsData, reconciliationsData] = await Promise.all([
    fetchAllReportRows<Omit<Row, "origin">>((from, to) => {
      let query = supabase
        .from("payables")
        .select("id,vendor_name,category,description,competence,due_date,paid_at,amount,payment_method,status,created_at,installment_number,installment_total,payable_series(kind)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .order("id");
      if (filters.status) query = query.eq("status", filters.status);
      return query.range(from, to) as unknown as PromiseLike<{ data: Array<Omit<Row, "origin">> | null; error: unknown }>;
    }),
    includeCommissions
      ? fetchAllReportRows<CommissionRow>((from, to) => supabase
          .from("commissions")
          .select("id,description,reference_date,due_date,commission_amount,status,payable_id,created_at,seller:commission_sellers!commissions_commission_seller_id_fkey(name,email)")
          .eq("company_id", companyId)
          .eq("status", "pendente")
          .is("payable_id", null)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to) as unknown as PromiseLike<{ data: CommissionRow[] | null; error: unknown }>)
      : Promise.resolve([] as CommissionRow[]),
    includeBankTransactions
      ? fetchAllReportRows<BankRow>((from, to) => supabase
          .from("bank_transactions")
          .select("id,transaction_date,description,amount,created_at,bank_accounts(bank_name)")
          .eq("company_id", companyId)
          .lt("amount", 0)
          .gte("transaction_date", filters.from)
          .lte("transaction_date", filters.to)
          .order("transaction_date", { ascending: false })
          .order("id")
          .range(from, to) as unknown as PromiseLike<{ data: BankRow[] | null; error: unknown }>)
      : Promise.resolve([] as BankRow[]),
    includeBankTransactions
      ? fetchAllReportRows<ReconciliationRow>((from, to) => supabase
          .from("bank_reconciliations")
          .select("bank_transaction_id,payable_id")
          .eq("company_id", companyId)
          .order("bank_transaction_id")
          .range(from, to) as unknown as PromiseLike<{ data: ReconciliationRow[] | null; error: unknown }>)
      : Promise.resolve([] as ReconciliationRow[])
  ]);

  const payableRows = payablesData
    .filter((row) => dateInRange(row.created_at, filters) || dateInRange(row.due_date, filters) || dateInRange(row.paid_at, filters))
    .map((row) => {
      const series = Array.isArray(row.payable_series) ? row.payable_series[0] || null : row.payable_series;
      const origin = row.category === "Comissoes"
        ? "Comissao aprovada"
        : series?.kind === "fixed"
          ? "Despesa fixa"
          : series?.kind === "installment"
            ? `Compra parcelada ${row.installment_number || "-"}/${row.installment_total || "-"}`
            : "Conta a pagar";
      return { ...row, origin };
    });
  const commissionRows = commissionsData
    .filter((commission) => (
      dateInRange(commission.created_at, filters)
      || dateInRange(commission.reference_date, filters)
      || dateInRange(commission.due_date, filters)
    ))
    .map((commission) => {
      const seller = Array.isArray(commission.seller) ? commission.seller[0] : commission.seller;
      return {
        id: commission.id,
        origin: "Comissao pendente",
        vendor_name: seller?.name || seller?.email || "Vendedor",
        category: "Comissoes",
        description: commission.description,
        competence: commission.reference_date.slice(0, 7),
        due_date: commission.due_date,
        paid_at: null,
        amount: commission.commission_amount,
        payment_method: null,
        status: "previsto",
        created_at: commission.created_at
      } satisfies Row;
    });

  const reconciliations = new Map<string, Array<{ payable_id: string | null }>>();
  for (const reconciliation of reconciliationsData) {
    const current = reconciliations.get(reconciliation.bank_transaction_id) || [];
    current.push({ payable_id: reconciliation.payable_id });
    reconciliations.set(reconciliation.bank_transaction_id, current);
  }
  const bankRows = bankTransactionsData.flatMap((transaction) => {
    const transactionReconciliations = reconciliations.get(transaction.id) || [];
    if (transactionReconciliations.some((reconciliation) => reconciliation.payable_id)) return [];
    const status = transactionReconciliations.length ? "conciliado" : "pago";
    if (filters.status && filters.status !== status) return [];
    const account = Array.isArray(transaction.bank_accounts)
      ? transaction.bank_accounts[0]
      : transaction.bank_accounts;
    return [{
      id: transaction.id,
      origin: "Transacao bancaria",
      vendor_name: account?.bank_name || "Conta bancaria",
      category: "Movimentacao bancaria",
      description: transaction.description || "Debito bancario",
      competence: transaction.transaction_date.slice(0, 7),
      due_date: transaction.transaction_date,
      paid_at: transaction.transaction_date,
      amount: Math.abs(Number(transaction.amount)),
      payment_method: "Conta bancaria",
      status,
      created_at: transaction.created_at
    } satisfies Row];
  });
  const rows = searchRows(
    [...payableRows, ...commissionRows, ...bankRows].sort((a, b) => b.due_date.localeCompare(a.due_date)),
    filters.search,
    (row) => [row.origin, row.vendor_name, row.category, row.description, row.competence, row.payment_method, row.status]
  );
  const valid = rows.filter((row) => row.status !== "cancelado");
  const paid = rows.filter((row) => ["pago", "conciliado"].includes(row.status));
  const open = rows.filter((row) => !["pago", "conciliado", "cancelado"].includes(row.status));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = open.filter((row) => row.status === "vencido" || row.due_date < today);

  return {
    title: "Saidas consolidadas",
    description: "Contas a pagar, comissoes e debitos bancarios sem duplicidade.",
    dateFieldLabel: "Cadastro, vencimento ou pagamento",
    metrics: [
      { label: "Total previsto", value: formatMoney(valid.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${valid.length} despesas` },
      { label: "Total pago", value: formatMoney(paid.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${paid.length} pagamentos` },
      { label: "Em aberto", value: formatMoney(open.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${open.length} pendencias` },
      { label: "Vencidos", value: formatMoney(overdue.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${overdue.length} despesas` }
    ],
    columns: [
      { key: "recordedAt", label: "Cadastro" },
      { key: "dueDate", label: "Vencimento" },
      { key: "origin", label: "Origem" },
      { key: "vendor", label: "Fornecedor" },
      { key: "category", label: "Categoria" },
      { key: "description", label: "Descricao" },
      { key: "competence", label: "Competencia" },
      { key: "amount", label: "Valor", align: "right" },
      { key: "paidAt", label: "Pagamento" },
      { key: "method", label: "Forma" },
      { key: "status", label: "Status" }
    ],
    rows: rows.map((row) => ({
      recordedAt: formatDate(row.created_at),
      dueDate: formatDate(row.due_date),
      origin: row.origin,
      vendor: row.vendor_name,
      category: row.category,
      description: row.description,
      competence: row.competence,
      amount: formatMoney(row.amount),
      paidAt: formatDate(row.paid_at),
      method: row.payment_method ? labelStatus(row.payment_method) : "-",
      status: labelStatus(row.status)
    }))
  };
}

async function commissionsReport(filters: ReportFilters): Promise<ReportResult> {
  type Row = {
    id: string;
    description: string;
    source_type: string;
    reference_date: string;
    due_date: string;
    base_amount: number | string;
    rate_percent: number | string;
    commission_amount: number | string;
    status: string;
    paid_at: string | null;
    payment_method: string | null;
    seller: { name: string; email: string | null } | Array<{ name: string; email: string | null }> | null;
  };

  const { supabase, companyId } = await getReportContext();
  const data = await fetchAllReportRows<Row>((from, to) => {
    let query = supabase
      .from("commissions")
      .select("id,description,source_type,reference_date,due_date,base_amount,rate_percent,commission_amount,status,paid_at,payment_method,seller:commission_sellers!commissions_commission_seller_id_fkey(name,email)")
      .eq("company_id", companyId)
      .gte("reference_date", filters.from)
      .lte("reference_date", filters.to)
      .order("reference_date", { ascending: false })
      .order("id");
    if (filters.status) query = query.eq("status", filters.status);
    return query.range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
  const rows = searchRows(data, filters.search, (row) => {
    const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
    return [row.description, row.source_type, row.status, seller?.name, seller?.email];
  });
  const active = rows.filter((row) => row.status !== "cancelada");
  const pending = rows.filter((row) => row.status === "pendente");
  const approved = rows.filter((row) => row.status === "aprovada");
  const paid = rows.filter((row) => row.status === "paga");

  return {
    title: "Comissoes de vendedores",
    description: "Comissoes por vendedor, origem, percentual, vencimento e pagamento.",
    dateFieldLabel: "Data de referencia",
    metrics: [
      { label: "Total gerado", value: formatMoney(active.reduce((sum, row) => sum + Number(row.commission_amount), 0)), detail: `${active.length} comissoes` },
      { label: "Pendente", value: formatMoney(pending.reduce((sum, row) => sum + Number(row.commission_amount), 0)), detail: `${pending.length} aguardando aprovacao` },
      { label: "Aprovado", value: formatMoney(approved.reduce((sum, row) => sum + Number(row.commission_amount), 0)), detail: `${approved.length} contas a pagar` },
      { label: "Pago", value: formatMoney(paid.reduce((sum, row) => sum + Number(row.commission_amount), 0)), detail: `${paid.length} pagamentos` }
    ],
    columns: [
      { key: "date", label: "Referencia" },
      { key: "seller", label: "Vendedor" },
      { key: "description", label: "Descricao" },
      { key: "source", label: "Origem" },
      { key: "base", label: "Base", align: "right" },
      { key: "rate", label: "Percentual", align: "right" },
      { key: "amount", label: "Comissao", align: "right" },
      { key: "dueDate", label: "Vencimento" },
      { key: "paidAt", label: "Pagamento" },
      { key: "status", label: "Status" }
    ],
    rows: rows.map((row) => {
      const seller = Array.isArray(row.seller) ? row.seller[0] : row.seller;
      return {
        date: formatDate(row.reference_date),
        seller: seller?.name || seller?.email || "-",
        description: row.description,
        source: labelStatus(row.source_type),
        base: formatMoney(row.base_amount),
        rate: `${formatNumber(row.rate_percent, 4)}%`,
        amount: formatMoney(row.commission_amount),
        dueDate: formatDate(row.due_date),
        paidAt: row.paid_at ? `${formatDate(row.paid_at)} · ${labelStatus(row.payment_method || "-")}` : "-",
        status: labelStatus(row.status)
      };
    })
  };
}

async function inventoryReport(filters: ReportFilters): Promise<ReportResult> {
  type Row = {
    id: string;
    sku: string | null;
    name: string;
    category: string | null;
    unit: string;
    cost_price: number | string;
    sale_price: number | string;
    current_stock: number | string;
    min_stock: number | string;
    active: boolean;
  };

  const { supabase, companyId } = await getReportContext();
  const data = await fetchAllReportRows<Row>((from, to) => {
    let query = supabase
      .from("products")
      .select("id,sku,name,category,unit,cost_price,sale_price,current_stock,min_stock,active")
      .eq("company_id", companyId)
      .order("name")
      .order("id");
    if (filters.status === "ativo") query = query.eq("active", true);
    if (filters.status === "inativo") query = query.eq("active", false);
    return query.range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
  let rows = searchRows(data, filters.search, (row) => [row.sku, row.name, row.category]);
  if (filters.status === "baixo") rows = rows.filter((row) => row.active && Number(row.current_stock) <= Number(row.min_stock));
  const active = rows.filter((row) => row.active);
  const low = active.filter((row) => Number(row.current_stock) <= Number(row.min_stock));

  return {
    title: "Posicao de estoque",
    description: "Saldo atual, estoque minimo e valor imobilizado por produto.",
    dateFieldLabel: "Saldo atual",
    metrics: [
      { label: "Produtos ativos", value: formatNumber(active.length, 0) },
      { label: "Estoque baixo", value: formatNumber(low.length, 0), detail: "Itens no minimo ou abaixo" },
      { label: "Valor de custo", value: formatMoney(rows.reduce((sum, row) => sum + Number(row.current_stock) * Number(row.cost_price), 0)) },
      { label: "Potencial de venda", value: formatMoney(rows.reduce((sum, row) => sum + Number(row.current_stock) * Number(row.sale_price), 0)) }
    ],
    columns: [
      { key: "sku", label: "SKU" },
      { key: "product", label: "Produto" },
      { key: "category", label: "Categoria" },
      { key: "stock", label: "Estoque", align: "right" },
      { key: "minimum", label: "Minimo", align: "right" },
      { key: "cost", label: "Custo", align: "right" },
      { key: "sale", label: "Venda", align: "right" },
      { key: "valuation", label: "Valor em estoque", align: "right" },
      { key: "status", label: "Status" }
    ],
    rows: rows.map((row) => ({
      sku: row.sku || "-",
      product: row.name,
      category: row.category || "-",
      stock: `${formatNumber(row.current_stock, 3)} ${row.unit}`,
      minimum: `${formatNumber(row.min_stock, 3)} ${row.unit}`,
      cost: formatMoney(row.cost_price),
      sale: formatMoney(row.sale_price),
      valuation: formatMoney(Number(row.current_stock) * Number(row.cost_price)),
      status: !row.active ? "Inativo" : Number(row.current_stock) <= Number(row.min_stock) ? "Estoque baixo" : "Regular"
    }))
  };
}

async function servicesReport(filters: ReportFilters): Promise<ReportResult> {
  type Row = {
    id: string;
    service_date: string;
    due_date: string | null;
    service_description: string;
    service_type: string;
    amount: number | string;
    status: string;
    clients: RelatedClient;
  };

  const { supabase, companyId } = await getReportContext();
  const data = await fetchAllReportRows<Row>((from, to) => {
    let query = supabase
      .from("service_records")
      .select("id,service_date,due_date,service_description,service_type,amount,status,clients(legal_name)")
      .eq("company_id", companyId)
      .gte("service_date", filters.from)
      .lte("service_date", filters.to)
      .order("service_date", { ascending: false })
      .order("id");
    if (filters.status) query = query.eq("status", filters.status);
    return query.range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
  const rows = searchRows(data, filters.search, (row) => [row.service_description, row.service_type, row.status, clientName(row.clients)]);
  const valid = rows.filter((row) => row.status !== "cancelado");
  const billed = rows.filter((row) => row.status === "faturado");

  return {
    title: "Servicos",
    description: "Producao, evolucao e faturamento dos servicos realizados.",
    dateFieldLabel: "Data do servico",
    metrics: [
      { label: "Valor dos servicos", value: formatMoney(valid.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${valid.length} servicos` },
      { label: "Faturado", value: formatMoney(billed.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${billed.length} servicos` },
      { label: "Em andamento", value: formatNumber(rows.filter((row) => row.status === "em_andamento").length, 0) },
      { label: "Concluidos", value: formatNumber(rows.filter((row) => row.status === "concluido").length, 0) }
    ],
    columns: [
      { key: "date", label: "Data" },
      { key: "description", label: "Servico" },
      { key: "client", label: "Cliente" },
      { key: "type", label: "Tipo" },
      { key: "dueDate", label: "Vencimento" },
      { key: "amount", label: "Valor", align: "right" },
      { key: "status", label: "Status" }
    ],
    rows: rows.map((row) => ({
      date: formatDate(row.service_date),
      description: row.service_description,
      client: clientName(row.clients),
      type: labelStatus(row.service_type),
      dueDate: formatDate(row.due_date),
      amount: formatMoney(row.amount),
      status: labelStatus(row.status)
    }))
  };
}

async function clientsReport(filters: ReportFilters): Promise<ReportResult> {
  type Row = {
    id: string;
    created_at: string;
    legal_name: string;
    trade_name: string | null;
    document: string;
    fiscal_email: string | null;
    financial_email: string | null;
    phone: string | null;
    status: string;
  };
  type OpticalRow = {
    id: string;
    client_id: string;
    exam_date: string;
    professional_name: string | null;
    right_eye: EyeData | null;
    left_eye: EyeData | null;
    clinical_data: ClinicalData | null;
    notes: string | null;
    created_at: string;
  };

  const { supabase, companyId } = await getReportContext();
  const companyResult = await supabase.from("companies").select("service_segment").eq("id", companyId).maybeSingle();
  if (companyResult.error) throw companyResult.error;
  const isOptical = companyResult.data?.service_segment === "otica";
  const [data, opticalData] = await Promise.all([
    fetchAllReportRows<Row>((from, to) => {
      let query = supabase
        .from("clients")
        .select("id,created_at,legal_name,trade_name,document,fiscal_email,financial_email,phone,status")
        .eq("company_id", companyId)
        .gte("created_at", `${filters.from}T00:00:00`)
        .lte("created_at", `${filters.to}T23:59:59`)
        .order("created_at", { ascending: false })
        .order("id");
      if (filters.status) query = query.eq("status", filters.status);
      return query.range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
    }),
    isOptical
      ? fetchAllReportRows<OpticalRow>((from, to) => supabase
          .from("client_optical_records")
          .select("id,client_id,exam_date,professional_name,right_eye,left_eye,clinical_data,notes,created_at")
          .eq("company_id", companyId)
          .order("exam_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to) as unknown as PromiseLike<{ data: OpticalRow[] | null; error: unknown }>)
      : Promise.resolve([] as OpticalRow[])
  ]);
  const latestPrescription = new Map<string, OpticalRow>();
  for (const prescription of opticalData) {
    if (!latestPrescription.has(prescription.client_id)) latestPrescription.set(prescription.client_id, prescription);
  }
  const withPrescription = data.map((row) => ({ ...row, prescription: latestPrescription.get(row.id) }));
  const rows = searchRows(withPrescription, filters.search, (row) => [
    row.legal_name,
    row.trade_name,
    row.document,
    row.fiscal_email,
    row.financial_email,
    row.phone,
    row.prescription?.professional_name,
    formatEye(row.prescription?.right_eye || null),
    formatEye(row.prescription?.left_eye || null),
    formatClinical(row.prescription?.clinical_data || null, row.prescription?.notes || null)
  ]);

  return {
    title: "Clientes",
    description: "Base de clientes cadastrados no periodo e canais de contato.",
    dateFieldLabel: "Data do cadastro",
    metrics: [
      { label: "Cadastrados no periodo", value: formatNumber(rows.length, 0) },
      { label: "Ativos", value: formatNumber(rows.filter((row) => row.status === "ativo").length, 0) },
      isOptical
        ? { label: "Com receita", value: formatNumber(rows.filter((row) => Boolean(row.prescription)).length, 0), detail: "Receita mais recente vinculada" }
        : { label: "Com e-mail fiscal", value: formatNumber(rows.filter((row) => Boolean(row.fiscal_email)).length, 0) },
      { label: "Com telefone", value: formatNumber(rows.filter((row) => Boolean(row.phone)).length, 0) }
    ],
    columns: [
      { key: "created", label: "Cadastro" },
      { key: "legalName", label: "Razao social / Nome" },
      { key: "tradeName", label: "Nome fantasia" },
      { key: "document", label: "CPF/CNPJ" },
      { key: "fiscalEmail", label: "E-mail fiscal" },
      { key: "financialEmail", label: "E-mail financeiro" },
      { key: "phone", label: "Telefone" },
      ...(isOptical ? [
        { key: "prescriptionDate", label: "Data da receita" },
        { key: "professional", label: "Profissional" },
        { key: "rightEye", label: "OD" },
        { key: "leftEye", label: "OE" },
        { key: "clinical", label: "Dados da receita" }
      ] : []),
      { key: "status", label: "Status" }
    ],
    rows: rows.map((row) => {
      const prescription = row.prescription;
      return {
        created: formatDate(row.created_at),
        legalName: row.legal_name,
        tradeName: row.trade_name || "-",
        document: row.document,
        fiscalEmail: row.fiscal_email || "-",
        financialEmail: row.financial_email || "-",
        phone: row.phone || "-",
        ...(isOptical ? {
          prescriptionDate: formatDate(prescription?.exam_date),
          professional: prescription?.professional_name || "-",
          rightEye: formatEye(prescription?.right_eye || null),
          leftEye: formatEye(prescription?.left_eye || null),
          clinical: formatClinical(prescription?.clinical_data || null, prescription?.notes || null)
        } : {}),
        status: labelStatus(row.status)
      };
    })
  };
}

async function fiscalReport(filters: ReportFilters): Promise<ReportResult> {
  type Row = {
    id: string;
    created_at: string;
    external_id: string | null;
    competence: string;
    service_amount: number | string;
    protocol: string | null;
    rejection_message: string | null;
    status: string;
    clients: RelatedClient;
  };

  const { supabase, companyId } = await getReportContext();
  const data = await fetchAllReportRows<Row>((from, to) => {
    let query = supabase
      .from("nfse_documents")
      .select("id,created_at,external_id,competence,service_amount,protocol,rejection_message,status,clients(legal_name)")
      .eq("company_id", companyId)
      .gte("created_at", `${filters.from}T00:00:00`)
      .lte("created_at", `${filters.to}T23:59:59`)
      .order("created_at", { ascending: false })
      .order("id");
    if (filters.status) query = query.eq("status", filters.status);
    return query.range(from, to) as unknown as PromiseLike<{ data: Row[] | null; error: unknown }>;
  });
  const rows = searchRows(data, filters.search, (row) => [row.external_id, row.protocol, row.competence, row.status, row.rejection_message, clientName(row.clients)]);
  const authorized = rows.filter((row) => row.status === "autorizada");

  return {
    title: "Documentos fiscais",
    description: "Emissoes de NFS-e, valores, protocolos e rejeicoes.",
    dateFieldLabel: "Data da emissao",
    metrics: [
      { label: "Notas autorizadas", value: formatNumber(authorized.length, 0), detail: formatMoney(authorized.reduce((sum, row) => sum + Number(row.service_amount), 0)) },
      { label: "Em processamento", value: formatNumber(rows.filter((row) => ["validada", "enfileirada", "enviada"].includes(row.status)).length, 0) },
      { label: "Rejeitadas", value: formatNumber(rows.filter((row) => ["rejeitada", "erro_integracao"].includes(row.status)).length, 0) },
      { label: "Canceladas", value: formatNumber(rows.filter((row) => row.status === "cancelada").length, 0) }
    ],
    columns: [
      { key: "created", label: "Data" },
      { key: "number", label: "Numero" },
      { key: "client", label: "Tomador" },
      { key: "competence", label: "Competencia" },
      { key: "amount", label: "Valor", align: "right" },
      { key: "protocol", label: "Protocolo" },
      { key: "status", label: "Status" },
      { key: "message", label: "Retorno" }
    ],
    rows: rows.map((row) => ({
      created: formatDate(row.created_at),
      number: row.external_id || row.id.slice(0, 8),
      client: clientName(row.clients),
      competence: row.competence,
      amount: formatMoney(row.service_amount),
      protocol: row.protocol || "-",
      status: labelStatus(row.status),
      message: row.rejection_message || "-"
    }))
  };
}

export async function getReportData(filters: ReportFilters) {
  switch (filters.report) {
    case "saidas": return payablesReport(filters);
    case "comissoes": return commissionsReport(filters);
    case "vendas": return salesReport(filters);
    case "estoque": return inventoryReport(filters);
    case "servicos": return servicesReport(filters);
    case "clientes": return clientsReport(filters);
    case "fiscal": return fiscalReport(filters);
    default: return financialReport(filters);
  }
}
