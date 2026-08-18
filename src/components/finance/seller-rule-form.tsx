"use client";

import { useState } from "react";

type Option = { id: string; name: string };
type ServiceOption = { value: string; label: string };

export function SellerRuleForm({
  sellers,
  products,
  catalogServices,
  serviceTypes,
  rule
}: {
  sellers: Option[];
  products: Option[];
  catalogServices: Option[];
  serviceTypes: ServiceOption[];
  rule?: {
    id: string;
    sellerId: string;
    sourceType: "venda" | "servico";
    productId: string | null;
    catalogServiceId: string | null;
    serviceType: string | null;
    ratePercent: number | string;
  };
}) {
  const [sourceType, setSourceType] = useState<"venda" | "servico">(rule?.sourceType || "venda");
  const [saleItemType, setSaleItemType] = useState<"produto" | "servico">(rule?.catalogServiceId ? "servico" : "produto");

  return (
    <form className="form-stack" action="/api/financeiro/vendedores" method="post">
      <input type="hidden" name="action" value={rule ? "update_rule" : "save_rule"} />
      {rule ? <input type="hidden" name="ruleId" value={rule.id} /> : null}
      <label>
        Vendedor
        <select name="sellerId" defaultValue={rule?.sellerId || ""} required>
          <option value="" disabled>Selecione um vendedor</option>
          {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
        </select>
      </label>
      <label>
        Origem
        <select name="sourceType" value={sourceType} onChange={(event) => setSourceType(event.target.value as "venda" | "servico")}>
          <option value="venda">Venda</option>
          <option value="servico">Servico</option>
        </select>
      </label>
      {sourceType === "venda" ? (
        <>
          <label>
            Tipo do item
            <select value={saleItemType} onChange={(event) => setSaleItemType(event.target.value as "produto" | "servico")}>
              <option value="produto">Produto</option>
              <option value="servico">Servico cadastrado</option>
            </select>
          </label>
          {saleItemType === "produto" ? (
            <label>
              Produto
              <select name="productId" defaultValue={rule?.sourceType === "venda" ? rule.productId || "" : ""}>
                <option value="">Todos os itens de venda (padrao)</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </label>
          ) : (
            <label>
              Servico cadastrado
              <select name="catalogServiceId" defaultValue={rule?.sourceType === "venda" ? rule.catalogServiceId || "" : ""}>
                <option value="">Todos os itens de venda (padrao)</option>
                {catalogServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
              </select>
            </label>
          )}
        </>
      ) : (
        <label>
          Tipo de servico
          <select name="serviceType" defaultValue={rule?.sourceType === "servico" ? rule.serviceType || "" : ""}>
            <option value="">Todos os servicos (padrao)</option>
            {serviceTypes.map((service) => <option key={service.value} value={service.value}>{service.label}</option>)}
          </select>
        </label>
      )}
      <label>
        Percentual
        <input name="ratePercent" inputMode="decimal" defaultValue={rule ? String(rule.ratePercent).replace(".", ",") : ""} placeholder="Ex.: 5,00" required />
      </label>
      <button className="primary-button" type="submit" disabled={!sellers.length}>{rule ? "Salvar alteracoes" : "Salvar percentual"}</button>
    </form>
  );
}
