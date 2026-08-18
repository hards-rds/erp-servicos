export type ServiceSegment = "tecnologia" | "otica" | "generico";

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
  generico: "Generico"
};
