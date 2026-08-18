export type SaleItemType = "produto" | "servico_catalogo" | "servico_avulso";

export function calculateSaleAmounts(quantity: number, unitPrice: number, discount: number) {
  const grossAmount = Math.round(quantity * unitPrice * 100) / 100;
  return {
    grossAmount,
    netAmount: Math.max(0, Math.round((grossAmount - discount) * 100) / 100)
  };
}

export function saleItemMovesStock(itemType: SaleItemType) {
  return itemType === "produto";
}
