"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

export function ReportPrintButton({ href }: { href: string }) {
  return (
    <a className="ghost-button button-link button-with-icon report-print-button" href={href} target="_blank">
      <Printer aria-hidden="true" size={17} />
      Imprimir / PDF
    </a>
  );
}

export function ReportAutoPrint() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
