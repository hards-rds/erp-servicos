import type { Metadata } from "next";
import "./globals.css";

const themeBootstrap = `
  (function () {
    try {
      var savedTheme = window.localStorage.getItem("erp-servicos:theme");
      document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";
    } catch (_) {
      document.documentElement.dataset.theme = "dark";
    }
  })();
`;

export const metadata: Metadata = {
  title: "ERP Servicos",
  description: "ERP web para empresas de servicos recorrentes",
  icons: {
    icon: [{ url: "/icon.svg?v=2", type: "image/svg+xml" }],
    shortcut: "/icon.svg?v=2"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeBootstrap }} /></head>
      <body>{children}</body>
    </html>
  );
}
