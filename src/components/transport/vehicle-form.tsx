export type VehicleFormValue = {
  id?: string; plate?: string; renavam?: string | null; registry_state?: string; vehicle_kind?: string;
  body_type?: string | null; make?: string | null; model?: string | null; model_year?: number | null;
  color?: string | null; rntrc?: string | null; ownership?: string; owner_name?: string | null;
  owner_document?: string | null; tare_kg?: number | string | null; capacity_kg?: number | string | null;
  capacity_m3?: number | string | null; odometer_km?: number | string | null; licensing_expires_at?: string | null;
  insurance_expires_at?: string | null; status?: string; notes?: string | null;
};

export function VehicleForm({ vehicle }: { vehicle?: VehicleFormValue }) {
  return <form className="form-stack" action="/api/transporte/frota" method="post">
    <input type="hidden" name="action" value={vehicle?.id ? "update" : "create"} />
    {vehicle?.id ? <input type="hidden" name="vehicleId" value={vehicle.id} /> : null}
    <fieldset><legend>Identificacao</legend>
      <div className="form-grid">
        <label>Placa<input name="plate" defaultValue={vehicle?.plate || ""} placeholder="ABC1D23" maxLength={8} required /></label>
        <label>RENAVAM<input name="renavam" defaultValue={vehicle?.renavam || ""} inputMode="numeric" /></label>
        <label>UF de registro<input name="registryState" defaultValue={vehicle?.registry_state || "MG"} maxLength={2} required /></label>
        <label>Tipo<select name="vehicleKind" defaultValue={vehicle?.vehicle_kind || "tracao"}><option value="tracao">Tracao</option><option value="reboque">Reboque</option><option value="utilitario">Utilitario</option><option value="outro">Outro</option></select></label>
      </div>
      <div className="form-grid">
        <label>Carroceria<input name="bodyType" defaultValue={vehicle?.body_type || ""} placeholder="Bau, graneleiro, tanque..." /></label>
        <label>Marca<input name="make" defaultValue={vehicle?.make || ""} /></label>
        <label>Modelo<input name="model" defaultValue={vehicle?.model || ""} /></label>
        <label>Ano modelo<input name="modelYear" type="number" min="1950" max="2200" defaultValue={vehicle?.model_year || ""} /></label>
      </div>
      <div className="form-grid"><label>Cor<input name="color" defaultValue={vehicle?.color || ""} /></label><label>RNTRC<input name="rntrc" defaultValue={vehicle?.rntrc || ""} /></label></div>
    </fieldset>
    <fieldset><legend>Propriedade e capacidade</legend>
      <div className="form-grid">
        <label>Vinculo<select name="ownership" defaultValue={vehicle?.ownership || "proprio"}><option value="proprio">Proprio</option><option value="arrendado">Arrendado</option><option value="terceiro">Terceiro</option></select></label>
        <label>Proprietario<input name="ownerName" defaultValue={vehicle?.owner_name || ""} /></label>
        <label>CPF/CNPJ do proprietario<input name="ownerDocument" defaultValue={vehicle?.owner_document || ""} /></label>
      </div>
      <div className="form-grid">
        <label>Tara (kg)<input name="tareKg" inputMode="decimal" defaultValue={vehicle?.tare_kg ?? ""} /></label>
        <label>Capacidade (kg)<input name="capacityKg" inputMode="decimal" defaultValue={vehicle?.capacity_kg ?? ""} /></label>
        <label>Capacidade (m3)<input name="capacityM3" inputMode="decimal" defaultValue={vehicle?.capacity_m3 ?? ""} /></label>
        <label>Hodometro (km)<input name="odometerKm" inputMode="decimal" defaultValue={vehicle?.odometer_km ?? ""} /></label>
      </div>
    </fieldset>
    <fieldset><legend>Controle</legend><div className="form-grid">
      <label>Licenciamento vence em<input name="licensingExpiresAt" type="date" defaultValue={vehicle?.licensing_expires_at || ""} /></label>
      <label>Seguro vence em<input name="insuranceExpiresAt" type="date" defaultValue={vehicle?.insurance_expires_at || ""} /></label>
      <label>Status<select name="status" defaultValue={vehicle?.status || "ativo"}><option value="ativo">Ativo</option><option value="manutencao">Em manutencao</option><option value="inativo">Inativo</option></select></label>
    </div><label>Observacoes<textarea name="notes" defaultValue={vehicle?.notes || ""} /></label></fieldset>
    <button className="primary-button" type="submit">{vehicle?.id ? "Salvar veiculo" : "Cadastrar veiculo"}</button>
  </form>;
}
