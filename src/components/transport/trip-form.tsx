type Option = { id: string; label: string };
export type TripFormValue = {
  id?: string; client_id?: string | null; sender_client_id?: string | null; recipient_client_id?: string | null; vehicle_id?: string; trailer_id?: string | null; driver_id?: string;
  status?: string; cargo_description?: string; cargo_type?: string | null; cargo_quantity?: number | string | null;
  gross_weight_kg?: number | string; cargo_value?: number | string; freight_value?: number | string;
  toll_value?: number | string; insurance_value?: number | string; other_costs?: number | string;
  origin_city?: string; origin_state?: string; origin_city_code?: string; destination_city?: string;
  destination_state?: string; destination_city_code?: string; scheduled_departure_at?: string;
  scheduled_arrival_at?: string | null; distance_km?: number | string | null; payer_role?: string;
  operational_notes?: string | null; access_key?: string | null;
};

function localDateTime(value?: string | null) { return value ? value.slice(0, 16) : ""; }

export function TripForm({ trip, clients, vehicles, trailers, drivers }: { trip?: TripFormValue; clients: Option[]; vehicles: Option[]; trailers: Option[]; drivers: Option[] }) {
  return <form className="form-stack" action="/api/transporte/viagens" method="post">
    <input type="hidden" name="action" value={trip?.id ? "update" : "create"} />{trip?.id ? <input type="hidden" name="tripId" value={trip.id} /> : null}
    <fieldset><legend>Operacao</legend>
      <div className="form-grid">
        <label>Tomador do frete<select name="clientId" defaultValue={trip?.client_id || ""}><option value="">Definir depois</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Remetente<select name="senderClientId" defaultValue={trip?.sender_client_id || ""}><option value="">Definir depois</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Destinatario<select name="recipientClientId" defaultValue={trip?.recipient_client_id || ""}><option value="">Definir depois</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Veiculo de tracao<select name="vehicleId" defaultValue={trip?.vehicle_id || ""} required><option value="" disabled>Selecione</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Reboque<select name="trailerId" defaultValue={trip?.trailer_id || ""}><option value="">Sem reboque</option>{trailers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Motorista<select name="driverId" defaultValue={trip?.driver_id || ""} required><option value="" disabled>Selecione</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </div>
      <div className="form-grid"><label>Saida prevista<input name="scheduledDepartureAt" type="datetime-local" defaultValue={localDateTime(trip?.scheduled_departure_at)} required /></label><label>Chegada prevista<input name="scheduledArrivalAt" type="datetime-local" defaultValue={localDateTime(trip?.scheduled_arrival_at)} /></label><label>Status<select name="status" defaultValue={trip?.status || "planejada"}><option value="planejada">Planejada</option><option value="carregamento">Em carregamento</option><option value="em_transito">Em transito</option><option value="entregue">Entregue</option><option value="cancelada">Cancelada</option></select></label></div>
    </fieldset>
    <fieldset><legend>Rota</legend><div className="form-grid">
      <label>Cidade de origem<input name="originCity" defaultValue={trip?.origin_city || ""} required /></label><label>UF origem<input name="originState" defaultValue={trip?.origin_state || "MG"} maxLength={2} required /></label><label>Codigo IBGE origem<input name="originCityCode" defaultValue={trip?.origin_city_code || ""} inputMode="numeric" maxLength={7} required /></label>
      <label>Cidade de destino<input name="destinationCity" defaultValue={trip?.destination_city || ""} required /></label><label>UF destino<input name="destinationState" defaultValue={trip?.destination_state || "MG"} maxLength={2} required /></label><label>Codigo IBGE destino<input name="destinationCityCode" defaultValue={trip?.destination_city_code || ""} inputMode="numeric" maxLength={7} required /></label>
      <label>Distancia (km)<input name="distanceKm" inputMode="decimal" defaultValue={trip?.distance_km ?? ""} /></label>
    </div></fieldset>
    <fieldset><legend>Carga e documento</legend>
      <label>Descricao da carga<input name="cargoDescription" defaultValue={trip?.cargo_description || ""} required /></label>
      <div className="form-grid"><label>Tipo da carga<input name="cargoType" defaultValue={trip?.cargo_type || ""} /></label><label>Quantidade<input name="cargoQuantity" inputMode="decimal" defaultValue={trip?.cargo_quantity ?? ""} /></label><label>Peso bruto (kg)<input name="grossWeightKg" inputMode="decimal" defaultValue={trip?.gross_weight_kg ?? "0"} required /></label><label>Valor da carga<input name="cargoValue" inputMode="decimal" defaultValue={trip?.cargo_value ?? "0"} required /></label></div>
      <label>Chave da NF-e principal<input name="accessKey" defaultValue={trip?.access_key || ""} inputMode="numeric" maxLength={44} placeholder="44 digitos, quando houver" /></label>
    </fieldset>
    <fieldset><legend>Frete</legend><div className="form-grid">
      <label>Valor do frete<input name="freightValue" inputMode="decimal" defaultValue={trip?.freight_value ?? ""} required /></label><label>Pedagio<input name="tollValue" inputMode="decimal" defaultValue={trip?.toll_value ?? "0"} /></label><label>Seguro<input name="insuranceValue" inputMode="decimal" defaultValue={trip?.insurance_value ?? "0"} /></label><label>Outros custos<input name="otherCosts" inputMode="decimal" defaultValue={trip?.other_costs ?? "0"} /></label>
      <label>Responsavel pelo frete<select name="payerRole" defaultValue={trip?.payer_role || "remetente"}><option value="remetente">Remetente</option><option value="destinatario">Destinatario</option><option value="expedidor">Expedidor</option><option value="recebedor">Recebedor</option><option value="outros">Outros</option></select></label>
    </div><label>Observacoes operacionais<textarea name="operationalNotes" defaultValue={trip?.operational_notes || ""} /></label></fieldset>
    <button className="primary-button" type="submit">{trip?.id ? "Salvar viagem" : "Cadastrar viagem"}</button>
  </form>;
}
