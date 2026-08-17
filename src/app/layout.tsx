import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERP Servicos",
  description: "ERP web para empresas de servicos recorrentes",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
