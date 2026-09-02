export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizePlate(value: string) {
  return value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function isValidBrazilianPlate(value: string) {
  const plate = normalizePlate(value);
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate);
}

export function isValidState(value: string) {
  return /^[A-Z]{2}$/.test(value.trim().toUpperCase());
}

export function isValidCityCode(value: string) {
  return /^\d{7}$/.test(onlyDigits(value));
}

export function isValidAccessKey(value: string) {
  const digits = onlyDigits(value);
  return !digits || digits.length === 44;
}

export function parseTransportNumber(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function cteValidationErrors(input: {
  cfop: string;
  operationNature: string;
  issueState: string;
  originCityCode: string;
  destinationCityCode: string;
  vehiclePlate: string;
  driverDocument: string;
  clientDocument?: string | null;
  freightValue: number;
}) {
  const errors: string[] = [];
  if (!/^\d{4}$/.test(onlyDigits(input.cfop))) errors.push("CFOP deve ter 4 digitos.");
  if (!input.operationNature.trim()) errors.push("Natureza da operacao e obrigatoria.");
  if (!isValidState(input.issueState)) errors.push("UF de emissao invalida.");
  if (!isValidCityCode(input.originCityCode)) errors.push("Codigo IBGE de origem deve ter 7 digitos.");
  if (!isValidCityCode(input.destinationCityCode)) errors.push("Codigo IBGE de destino deve ter 7 digitos.");
  if (!isValidBrazilianPlate(input.vehiclePlate)) errors.push("Placa do veiculo invalida.");
  if (onlyDigits(input.driverDocument).length !== 11) errors.push("CPF do motorista deve ter 11 digitos.");
  if (input.clientDocument && ![11, 14].includes(onlyDigits(input.clientDocument).length)) errors.push("Documento do tomador invalido.");
  if (!Number.isFinite(input.freightValue) || input.freightValue <= 0) errors.push("Valor do frete deve ser maior que zero.");
  return errors;
}
