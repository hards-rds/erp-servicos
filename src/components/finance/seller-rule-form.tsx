"use client";

import { useState } from "react";

type Option = { id: string; name: string };
type ServiceOption = { value: string; label: string };

export function SellerRuleForm({
  sellers,
  products,
  serviceTypes
}: {
  sellers: Option[];
  products: Option[];
  serviceTypes: ServiceOption[];
}) {
  const [sourceType, setSourceType] = useState<"venda" | "servico">("venda");

  return (
    <form className="form-stack" action="/api/financeiro/vendedores" method="post">
      <input type="hidden" name="action" value="save_rule" />
      <label>
        Vendedor
        <select name="sellerId" defaultValue="" required>
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
        <label>
          Produto
          <select name="productId" defaultValue="">
            <option value="">Todos os produtos (padrao)</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
      ) : (
        <label>
          Tipo de servico
          <select name="serviceType" defaultValue="">
            <option value="">Todos os servicos (padrao)</option>
            {serviceTypes.map((service) => <option key={service.value} value={service.value}>{service.label}</option>)}
          </select>
        </label>
      )}
      <label>
        Percentual
        <input name="ratePercent" inputMode="decimal" placeholder="Ex.: 5,00" required />
      </label>
      <button className="primary-button" type="submit" disabled={!sellers.length}>Salvar percentual</button>
    </form>
  );
}
