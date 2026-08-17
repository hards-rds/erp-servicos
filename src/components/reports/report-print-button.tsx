"use client";

import { Printer } from "lucide-react";

export function ReportPrintButton() {
  return (
    <button className="ghost-button button-with-icon report-print-button" type="button" onClick={() => window.print()}>
      <Printer aria-hidden="true" size={17} />
      Imprimir / PDF
    </button>
  );
}
