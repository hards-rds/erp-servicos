import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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
  const action = readString(formData, "action") || "product";

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

    return redirectWith(request, productError ? "movement_error" : "movement_created");
  }

  const name = readString(formData, "name");
  const salePrice = parseMoney(readString(formData, "salePrice"));
  const costPrice = parseMoney(readString(formData, "costPrice")) || 0;
  const minStock = parseQuantity(readString(formData, "minStock")) || 0;
  const initialStock = parseQuantity(readString(formData, "initialStock")) || 0;

  if (!name || salePrice === null || salePrice < 0 || costPrice < 0 || minStock < 0 || initialStock < 0) {
    return redirectWith(request, "product_invalid");
  }

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

  if (error || !product?.id) return redirectWith(request, error?.code === "23505" ? "duplicate" : "product_error");

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

  return redirectWith(request, "product_created");
}
