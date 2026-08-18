"use client";

import { useState } from "react";
import type { SaleItemType } from "@/domains/sales/items";

type Client = { id: string; name: string };
type Product = { id: string; name: string; price: number; stock: number; unit: string };
type CatalogService = { id: string; name: string; description: string | null; price: number };
type Seller = { id: string; name: string };

function moneyInput(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function SaleForm({
  clients,
  products,
  catalogServices,
  sellers
}: {
  clients: Client[];
  products: Product[];
  catalogServices: CatalogService[];
  sellers: Seller[];
}) {
  const [itemType, setItemType] = useState<SaleItemType>("produto");
  const [unitPrice, setUnitPrice] = useState("");
  const [description, setDescription] = useState("");
  const today = new Date().toISOString().slice(0, 10);

  function chooseProduct(productId: string) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setUnitPrice(moneyInput(product.price));
    setDescription(`Venda - ${product.name}`);
  }

  function chooseService(serviceId: string) {
    const service = catalogServices.find((item) => item.id === serviceId);
    if (!service) return;
    setUnitPrice(moneyInput(service.price));
    setDescription(service.description || service.name);
  }

  function changeType(nextType: SaleItemType) {
    setItemType(nextType);
    setUnitPrice("");
    setDescription("");
  }

  return (
    <form className="form-stack" action="/api/operacao/vendas" method="post">
      <input type="hidden" name="itemType" value={itemType} />
      <label>
        Cliente
        <select name="clientId" defaultValue="">
          <option value="">Consumidor final</option>
          {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
        </select>
      </label>
      <fieldset className="checkbox-panel">
        <legend>Item da venda</legend>
        <div className="segmented-control" role="group" aria-label="Tipo de item">
          <button type="button" aria-pressed={itemType === "produto"} onClick={() => changeType("produto")}>Produto</button>
          <button type="button" aria-pressed={itemType === "servico_catalogo"} onClick={() => changeType("servico_catalogo")}>Servico cadastrado</button>
          <button type="button" aria-pressed={itemType === "servico_avulso"} onClick={() => changeType("servico_avulso")}>Servico avulso</button>
        </div>
        {itemType === "produto" ? (
          <label>
            Produto
            <select name="productId" defaultValue="" required onChange={(event) => chooseProduct(event.target.value)}>
              <option value="" disabled>Selecione um produto com estoque</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} · {product.stock.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} {product.unit}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {itemType === "servico_catalogo" ? (
          <label>
            Servico
            <select name="catalogServiceId" defaultValue="" required onChange={(event) => chooseService(event.target.value)}>
              <option value="" disabled>Selecione um servico cadastrado</option>
              {catalogServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </label>
        ) : null}
        <label>
          {itemType === "servico_avulso" ? "Descricao do servico avulso" : "Descricao da venda"}
          <input
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={itemType === "servico_avulso" ? "Ex.: Ajuste emergencial de armacao" : "Descricao do item"}
            required={itemType === "servico_avulso"}
          />
        </label>
        <div className="form-grid">
          <label>
            Quantidade
            <input name="quantity" inputMode="decimal" defaultValue="1" required />
          </label>
          <label>
            Valor unitario
            <input name="unitPrice" inputMode="decimal" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="0,00" required />
          </label>
        </div>
      </fieldset>
      <div className="form-grid">
        <label>Desconto<input name="discountAmount" inputMode="decimal" placeholder="0,00" /></label>
        <label>Data da venda<input name="saleDate" type="date" defaultValue={today} required /></label>
      </div>
      <div className="form-grid">
        <label>Vencimento<input name="dueDate" type="date" defaultValue={today} /></label>
        <label>
          Status
          <select name="status" defaultValue="faturada">
            <option value="faturada">Faturada</option>
            <option value="recebida">Recebida</option>
            <option value="aberta">Aberta</option>
          </select>
        </label>
      </div>
      <label>Forma de pagamento<input name="paymentMethod" placeholder="Pix, cartao, boleto, dinheiro..." /></label>
      <fieldset className="checkbox-panel">
        <legend>Comissao do vendedor</legend>
        <label>
          Vendedor
          <select name="sellerId" defaultValue="">
            <option value="">Sem comissao</option>
            {sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
          </select>
        </label>
        <label>Vencimento da comissao<input name="commissionDueDate" type="date" defaultValue={today} /></label>
        <a className="ghost-button button-link" href="/financeiro/comissoes/vendedores">Configurar percentuais</a>
      </fieldset>
      <label>Observacoes<textarea name="notes" placeholder="Entrega, condicoes comerciais ou observacoes internas" /></label>
      <button className="primary-button" type="submit">Registrar venda</button>
    </form>
  );
}
