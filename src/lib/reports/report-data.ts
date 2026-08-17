import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ReportFilters, ReportResult } from "@/lib/reports/types";

type RelatedClient = { legal_name: string } | Array<{ legal_name: string }> | null;

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

function searchRows<T>(rows: T[], search: string, values: (row: T) => Array<unknown>) {
  if (!search) return rows;
  const needle = search.toLocaleLowerCase("pt-BR");
  return rows.filter((row) => values(row).join(" ").toLocaleLowerCase("pt-BR").includes(needle));
}

async function getReportContext() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuario nao autenticado.");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error || !profile?.company_id) throw error || new Error("Empresa ativa nao encontrada.");

  return { supabase, companyId: profile.company_id as string };
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
  let query = supabase
    .from("financial_entries")
    .select("id,description,type,competence,due_date,received_at,received_amount,net_amount,payment_method,status,clients(legal_name)")
    .eq("company_id", companyId)
    .gte("due_date", filters.from)
    .lte("due_date", filters.to)
    .order("due_date", { ascending: false })
    .limit(2000);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = searchRows((data || []) as Row[], filters.search, (row) => [row.description, row.type, row.competence, row.status, clientName(row.clients)]);
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
  let query = supabase
    .from("sales")
    .select("id,sale_date,description,gross_amount,discount_amount,net_amount,payment_method,status,clients(legal_name)")
    .eq("company_id", companyId)
    .gte("sale_date", filters.from)
    .lte("sale_date", filters.to)
    .order("sale_date", { ascending: false })
    .limit(2000);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = searchRows((data || []) as Row[], filters.search, (row) => [row.description, row.status, row.payment_method, clientName(row.clients)]);
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

  const { supabase, companyId } = await getReportContext();
  let query = supabase
    .from("payables")
    .select("id,vendor_name,category,description,competence,due_date,paid_at,amount,payment_method,status")
    .eq("company_id", companyId)
    .gte("due_date", filters.from)
    .lte("due_date", filters.to)
    .order("due_date", { ascending: false })
    .limit(2000);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = searchRows((data || []) as Row[], filters.search, (row) => [row.vendor_name, row.category, row.description, row.competence, row.payment_method, row.status]);
  const valid = rows.filter((row) => row.status !== "cancelado");
  const paid = rows.filter((row) => ["pago", "conciliado"].includes(row.status));
  const open = rows.filter((row) => !["pago", "conciliado", "cancelado"].includes(row.status));
  const today = new Date().toISOString().slice(0, 10);
  const overdue = open.filter((row) => row.status === "vencido" || row.due_date < today);

  return {
    title: "Contas a pagar",
    description: "Despesas por fornecedor, categoria, vencimento e pagamento.",
    dateFieldLabel: "Vencimento",
    metrics: [
      { label: "Total previsto", value: formatMoney(valid.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${valid.length} despesas` },
      { label: "Total pago", value: formatMoney(paid.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${paid.length} pagamentos` },
      { label: "Em aberto", value: formatMoney(open.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${open.length} pendencias` },
      { label: "Vencidos", value: formatMoney(overdue.reduce((sum, row) => sum + Number(row.amount), 0)), detail: `${overdue.length} despesas` }
    ],
    columns: [
      { key: "dueDate", label: "Vencimento" },
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
      dueDate: formatDate(row.due_date),
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
  let query = supabase
    .from("products")
    .select("id,sku,name,category,unit,cost_price,sale_price,current_stock,min_stock,active")
    .eq("company_id", companyId)
    .order("name")
    .limit(2000);
  if (filters.status === "ativo") query = query.eq("active", true);
  if (filters.status === "inativo") query = query.eq("active", false);
  const { data, error } = await query;
  if (error) throw error;
  let rows = searchRows((data || []) as Row[], filters.search, (row) => [row.sku, row.name, row.category]);
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
  let query = supabase
    .from("service_records")
    .select("id,service_date,due_date,service_description,service_type,amount,status,clients(legal_name)")
    .eq("company_id", companyId)
    .gte("service_date", filters.from)
    .lte("service_date", filters.to)
    .order("service_date", { ascending: false })
    .limit(2000);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = searchRows((data || []) as Row[], filters.search, (row) => [row.service_description, row.service_type, row.status, clientName(row.clients)]);
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

  const { supabase, companyId } = await getReportContext();
  let query = supabase
    .from("clients")
    .select("id,created_at,legal_name,trade_name,document,fiscal_email,financial_email,phone,status")
    .eq("company_id", companyId)
    .gte("created_at", `${filters.from}T00:00:00`)
    .lte("created_at", `${filters.to}T23:59:59`)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = searchRows((data || []) as Row[], filters.search, (row) => [row.legal_name, row.trade_name, row.document, row.fiscal_email, row.financial_email, row.phone]);

  return {
    title: "Clientes",
    description: "Base de clientes cadastrados no periodo e canais de contato.",
    dateFieldLabel: "Data do cadastro",
    metrics: [
      { label: "Cadastrados no periodo", value: formatNumber(rows.length, 0) },
      { label: "Ativos", value: formatNumber(rows.filter((row) => row.status === "ativo").length, 0) },
      { label: "Com e-mail fiscal", value: formatNumber(rows.filter((row) => Boolean(row.fiscal_email)).length, 0) },
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
      { key: "status", label: "Status" }
    ],
    rows: rows.map((row) => ({
      created: formatDate(row.created_at),
      legalName: row.legal_name,
      tradeName: row.trade_name || "-",
      document: row.document,
      fiscalEmail: row.fiscal_email || "-",
      financialEmail: row.financial_email || "-",
      phone: row.phone || "-",
      status: labelStatus(row.status)
    }))
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
  let query = supabase
    .from("nfse_documents")
    .select("id,created_at,external_id,competence,service_amount,protocol,rejection_message,status,clients(legal_name)")
    .eq("company_id", companyId)
    .gte("created_at", `${filters.from}T00:00:00`)
    .lte("created_at", `${filters.to}T23:59:59`)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw error;
  const rows = searchRows((data || []) as Row[], filters.search, (row) => [row.external_id, row.protocol, row.competence, row.status, row.rejection_message, clientName(row.clients)]);
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
    case "vendas": return salesReport(filters);
    case "estoque": return inventoryReport(filters);
    case "servicos": return servicesReport(filters);
    case "clientes": return clientsReport(filters);
    case "fiscal": return fiscalReport(filters);
    default: return financialReport(filters);
  }
}
