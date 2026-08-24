type ProductOption = { id: string; name: string };

export function ProductForm() {
  return (
    <form className="form-stack" action="/api/operacao/estoque" method="post">
      <input type="hidden" name="action" value="product" />
      <div className="form-grid">
        <label>Nome<input name="name" placeholder="Ex.: Lente multifocal, mouse, cabo..." required /></label>
        <label>SKU<input name="sku" placeholder="Codigo interno" /></label>
        <label>Categoria<input name="category" placeholder="Lentes, armacoes, hardware..." /></label>
        <label>Unidade<input name="unit" defaultValue="un" /></label>
      </div>
      <div className="form-grid">
        <label>Custo<input name="costPrice" inputMode="decimal" placeholder="0,00" /></label>
        <label>Preco de venda<input name="salePrice" inputMode="decimal" placeholder="0,00" required /></label>
        <label>Estoque inicial<input name="initialStock" inputMode="decimal" placeholder="0" /></label>
        <label>Estoque minimo<input name="minStock" inputMode="decimal" placeholder="0" /></label>
      </div>
      <label>Observacoes<textarea name="notes" placeholder="Marca, fornecedor ou dados internos" /></label>
      <div className="page-form-actions">
        <a className="ghost-button button-link" href="/operacao/estoque">Cancelar</a>
        <button className="primary-button" type="submit">Cadastrar produto</button>
      </div>
    </form>
  );
}

export function StockMovementForm({ products }: { products: ProductOption[] }) {
  return (
    <form className="form-stack" action="/api/operacao/estoque" method="post">
      <input type="hidden" name="action" value="movement" />
      <label>
        Produto
        <select name="productId" required defaultValue="">
          <option value="" disabled>Selecione um produto</option>
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Tipo
          <select name="type" defaultValue="entrada">
            <option value="entrada">Entrada</option>
            <option value="saida">Saida</option>
            <option value="ajuste">Ajuste de saldo</option>
          </select>
        </label>
        <label>Data<input name="movementDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
        <label>Quantidade<input name="quantity" inputMode="decimal" placeholder="1" required /></label>
        <label>Custo unitario<input name="unitCost" inputMode="decimal" placeholder="0,00" /></label>
      </div>
      <label>Motivo<input name="reason" placeholder="Compra, perda, inventario..." /></label>
      <div className="page-form-actions">
        <a className="ghost-button button-link" href="/operacao/estoque">Cancelar</a>
        <button className="primary-button" type="submit" disabled={!products.length}>Salvar movimentacao</button>
      </div>
    </form>
  );
}
