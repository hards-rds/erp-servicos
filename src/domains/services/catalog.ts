export type ServiceSegment = "tecnologia" | "otica" | "escola_futebol" | "transportadora" | "generico";

export const serviceTypeOptions: Record<ServiceSegment, { value: string; label: string }[]> = {
  tecnologia: [
    { value: "suporte", label: "Suporte" },
    { value: "manutencao", label: "Manutencao" },
    { value: "implantacao", label: "Implantacao" },
    { value: "consultoria", label: "Consultoria" },
    { value: "visita_tecnica", label: "Visita tecnica" },
    { value: "recorrente", label: "Recorrente" },
    { value: "avulso", label: "Avulso" }
  ],
  otica: [
    { value: "venda_oculos", label: "Venda de oculos" },
    { value: "lente", label: "Lente" },
    { value: "armacao", label: "Armacao" },
    { value: "ajuste", label: "Ajuste" },
    { value: "exame", label: "Exame" },
    { value: "garantia", label: "Garantia" },
    { value: "avulso", label: "Avulso" }
  ],
  escola_futebol: [
    { value: "mensalidade", label: "Mensalidade" },
    { value: "treino_individual", label: "Treino individual" },
    { value: "avaliacao", label: "Avaliacao esportiva" },
    { value: "clinica", label: "Clinica de futebol" },
    { value: "torneio", label: "Torneio" },
    { value: "avulso", label: "Avulso" }
  ],
  transportadora: [
    { value: "frete_rodoviario", label: "Frete rodoviario" },
    { value: "carga_fechada", label: "Carga fechada" },
    { value: "carga_fracionada", label: "Carga fracionada" },
    { value: "redespacho", label: "Redespacho" },
    { value: "armazenagem", label: "Armazenagem" },
    { value: "locacao_veiculo", label: "Locacao de veiculo" },
    { value: "avulso", label: "Avulso" }
  ],
  generico: [
    { value: "avulso", label: "Avulso" },
    { value: "recorrente", label: "Recorrente" },
    { value: "consultoria", label: "Consultoria" },
    { value: "manutencao", label: "Manutencao" }
  ]
};

export const segmentLabels: Record<ServiceSegment, string> = {
  tecnologia: "Tecnologia",
  otica: "Otica",
  escola_futebol: "Escola de futebol",
  transportadora: "Transportadora",
  generico: "Generico"
};
