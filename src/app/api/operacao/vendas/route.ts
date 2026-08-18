import { NextRequest, NextResponse } from "next/server";
import { calculateSaleAmounts, saleItemMovesStock, type SaleItemType } from "@/domains/sales/items";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveSellerCommissionRate, syncSourceCommission } from "@/server/services/comissoes-service";

function readString(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function parseMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : null;
}

function parseQuantity(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const quantity = Number(normalized);
  return Number.isFinite(quantity) ? quantity : null;
}

function redirectWith(request: NextRequest, status: string) {
  return NextResponse.redirect(new URL(`/operacao/vendas?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url), 303);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,company_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.company_id) return redirectWith(request, "profile_error");

  const formData = await request.formData();
  const itemType = readString(formData, "itemType") as SaleItemType;
  const productId = readString(formData, "productId") || null;
  const catalogServiceId = readString(formData, "catalogServiceId") || null;
  const clientId = readString(formData, "clientId") || null;
  const quantity = parseQuantity(readString(formData, "quantity"));
  const unitPrice = parseMoney(readString(formData, "unitPrice"));
  const discount = parseMoney(readString(formData, "discountAmount")) || 0;
  const saleDate = readString(formData, "saleDate") || new Date().toISOString().slice(0, 10);
  const status = readString(formData, "status") || "faturada";
  const sellerId = readString(formData, "sellerId") || null;

  if (
    !["produto", "servico_catalogo", "servico_avulso"].includes(itemType) ||
    !quantity || quantity <= 0 || unitPrice === null || unitPrice < 0 || discount < 0 ||
    !["aberta", "faturada", "recebida"].includes(status)
  ) {
    return redirectWith(request, "invalid");
  }

  let product: { id: string; name: string; current_stock: number | string } | null = null;
  let catalogService: { id: string; name: string; description: string | null } | null = null;
  let itemName = readString(formData, "description");
  let commissionItemKey = "*";

  if (itemType === "produto") {
    if (!productId || catalogServiceId) return redirectWith(request, "invalid");
    const { data } = await supabase
      .from("products")
      .select("id,name,current_stock")
      .eq("id", productId)
      .eq("company_id", profile.company_id)
      .eq("active", true)
      .maybeSingle();
    product = data;
    if (!product) return redirectWith(request, "invalid");
    itemName ||= product.name;
    commissionItemKey = product.id;
  } else if (itemType === "servico_catalogo") {
    if (!catalogServiceId || productId) return redirectWith(request, "invalid");
    const { data } = await supabase
      .from("service_catalog")
      .select("id,name,description")
      .eq("id", catalogServiceId)
      .eq("company_id", profile.company_id)
      .eq("active", true)
      .maybeSingle();
    catalogService = data;
    if (!catalogService) return redirectWith(request, "invalid");
    itemName ||= catalogService.description || catalogService.name;
    commissionItemKey = catalogService.id;
  } else {
    if (productId || catalogServiceId || !itemName) return redirectWith(request, "invalid");
  }

  let commissionRate: number | null = null;
  if (sellerId) {
    const commissionRule = await resolveSellerCommissionRate({
      supabase,
      companyId: profile.company_id,
      sellerId,
      sourceType: "venda",
      itemKey: commissionItemKey
    });
    if (commissionRule.error || commissionRule.ratePercent === null) {
      return redirectWith(request, "commission_rule_missing");
    }
    commissionRate = commissionRule.ratePercent;
  }

  const currentStock = product ? Number(product.current_stock || 0) : 0;
  if (product && currentStock < quantity) return redirectWith(request, "stock_insufficient");

  const { grossAmount, netAmount } = calculateSaleAmounts(quantity, unitPrice, discount);
  const description = itemName;

  const { data: sale, error: saleError } = await supabase.from("sales").insert({
    company_id: profile.company_id,
    client_id: clientId,
    sale_date: saleDate,
    description,
    gross_amount: grossAmount,
    discount_amount: discount,
    net_amount: netAmount,
    payment_method: readString(formData, "paymentMethod") || null,
    status,
    notes: readString(formData, "notes") || null,
    created_by: profile.id,
    updated_by: profile.id
  }).select("id").single();

  if (saleError || !sale?.id) return redirectWith(request, "error");

  const { error: itemError } = await supabase.from("sale_items").insert({
    sale_id: sale.id,
    item_type: itemType,
    product_id: product?.id || null,
    service_catalog_id: catalogService?.id || null,
    description,
    quantity,
    unit_price: unitPrice,
    total_amount: grossAmount
  });

  if (itemError) return redirectWith(request, "error");

  if (saleItemMovesStock(itemType) && product) {
    const nextStock = currentStock - quantity;
    const { error: productError } = await supabase
      .from("products")
      .update({
        current_stock: nextStock,
        updated_by: profile.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", product.id)
      .eq("company_id", profile.company_id);

    if (productError) return redirectWith(request, "error");

    await supabase.from("stock_movements").insert({
      company_id: profile.company_id,
      product_id: product.id,
      sale_id: sale.id,
      movement_date: saleDate,
      type: "saida",
      quantity,
      unit_cost: 0,
      reason: `Venda ${sale.id.slice(0, 8)}`,
      created_by: profile.id
    });
  }

  const idempotencyKey = `sale:${sale.id}`;
  const { data: entry } = await supabase.from("financial_entries").insert({
    company_id: profile.company_id,
    client_id: clientId,
    type: "manual",
    description,
    competence: saleDate.slice(0, 7),
    issued_at: saleDate,
    due_date: readString(formData, "dueDate") || saleDate,
    gross_amount: grossAmount,
    discounts: discount,
    interest: 0,
    penalty: 0,
    net_amount: netAmount,
    payment_method: readString(formData, "paymentMethod") || null,
    status: status === "recebida" ? "recebido" : "aguardando_pagamento",
    idempotency_key: idempotencyKey,
    notes: readString(formData, "notes") || null,
    created_by: profile.id,
    updated_by: profile.id
  }).select("id").single();

  if (entry?.id) {
    await supabase.from("sales").update({
      financial_entry_id: entry.id,
      updated_at: new Date().toISOString()
    }).eq("id", sale.id).eq("company_id", profile.company_id);
  }

  const commissionResult = await syncSourceCommission({
    supabase,
    companyId: profile.company_id,
    profileId: profile.id,
    sellerId,
    sourceType: "venda",
    sourceId: sale.id,
    referenceDate: saleDate,
    description: `Comissao - ${description}`,
    baseAmount: netAmount,
    ratePercent: commissionRate,
    dueDate: readString(formData, "commissionDueDate") || saleDate
  });
  if (commissionResult.error) return redirectWith(request, "commission_error");

  return redirectWith(request, "created");
}
