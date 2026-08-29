import { NextRequest, NextResponse } from "next/server";
import { requireCompanyPermission, writeCompanyAudit } from "@/lib/auth/api-access";
import { isPlanLimitError } from "@/domains/billing/saas-plans";
import { canCreateTenantResource } from "@/server/services/saas-plan-service";

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
  return NextResponse.redirect(new URL(`/operacao/estoque?status=${status}`, request.url), 303);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = readString(formData, "action") || "product";
  const access = await requireCompanyPermission({
    module: "operacao.estoque",
    action: action === "movement" ? "editar" : "criar"
  });
  if (!access.ok) {
    if (access.reason === "unauthorized") return NextResponse.redirect(new URL("/login", request.url), 303);
    return redirectWith(request, access.reason === "forbidden" ? "forbidden" : "profile_error");
  }
  const { supabase, profile } = access;

  if (action === "movement") {
    const productId = readString(formData, "productId");
    const type = readString(formData, "type");
    const quantity = parseQuantity(readString(formData, "quantity"));
    const unitCost = parseMoney(readString(formData, "unitCost")) || 0;

    if (!productId || !["entrada", "saida", "ajuste"].includes(type) || !quantity || quantity <= 0) {
      return redirectWith(request, "movement_invalid");
    }

    const { data: product } = await supabase
      .from("products")
      .select("id,current_stock")
      .eq("id", productId)
      .eq("company_id", profile.company_id)
      .maybeSingle();

    if (!product) return redirectWith(request, "movement_invalid");

    const currentStock = Number(product.current_stock || 0);
    const nextStock = type === "entrada" ? currentStock + quantity : type === "saida" ? currentStock - quantity : quantity;
    if (nextStock < 0) return redirectWith(request, "stock_negative");

    const { error: movementError } = await supabase.from("stock_movements").insert({
      company_id: profile.company_id,
      product_id: product.id,
      movement_date: readString(formData, "movementDate") || new Date().toISOString().slice(0, 10),
      type,
      quantity,
      unit_cost: unitCost,
      reason: readString(formData, "reason") || null,
      created_by: profile.id
    });

    if (movementError) return redirectWith(request, "movement_error");

    const { error: productError } = await supabase
      .from("products")
      .update({
        current_stock: nextStock,
        updated_by: profile.id,
        updated_at: new Date().toISOString()
      })
      .eq("id", product.id)
      .eq("company_id", profile.company_id);

    if (productError) return redirectWith(request, "movement_error");
    await writeCompanyAudit({
      companyId: profile.company_id,
      actorId: profile.id,
      entity: "product",
      entityId: product.id,
      action: "stock_movement",
      metadata: { type, quantity, previousStock: currentStock, nextStock }
    });
    return redirectWith(request, "movement_created");
  }

  const name = readString(formData, "name");
  const salePrice = parseMoney(readString(formData, "salePrice"));
  const costPrice = parseMoney(readString(formData, "costPrice")) || 0;
  const minStock = parseQuantity(readString(formData, "minStock")) || 0;
  const initialStock = parseQuantity(readString(formData, "initialStock")) || 0;

  if (!name || salePrice === null || salePrice < 0 || costPrice < 0 || minStock < 0 || initialStock < 0) {
    return redirectWith(request, "product_invalid");
  }

  const capacity = await canCreateTenantResource(profile.tenant_id, "catalog_items");
  if (!capacity.allowed) return redirectWith(request, "plan_limit");

  const { data: product, error } = await supabase.from("products").insert({
    company_id: profile.company_id,
    sku: readString(formData, "sku") || null,
    name,
    category: readString(formData, "category") || null,
    unit: readString(formData, "unit") || "un",
    cost_price: costPrice,
    sale_price: salePrice,
    current_stock: initialStock,
    min_stock: minStock,
    notes: readString(formData, "notes") || null,
    created_by: profile.id,
    updated_by: profile.id
  }).select("id").single();

  if (error || !product?.id) return redirectWith(request, error?.code === "23505" ? "duplicate" : isPlanLimitError(error) ? "plan_limit" : "product_error");

  if (initialStock > 0) {
    await supabase.from("stock_movements").insert({
      company_id: profile.company_id,
      product_id: product.id,
      movement_date: new Date().toISOString().slice(0, 10),
      type: "entrada",
      quantity: initialStock,
      unit_cost: costPrice,
      reason: "Estoque inicial",
      created_by: profile.id
    });
  }

  await writeCompanyAudit({
    companyId: profile.company_id,
    actorId: profile.id,
    entity: "product",
    entityId: product.id,
    action: "create",
    metadata: { initialStock }
  });

  return redirectWith(request, "product_created");
}
