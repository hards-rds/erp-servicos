"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  BarChart3,
  Barcode,
  Building2,
  Building,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FilePlus2,
  FileText,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Package,
  Plug,
  ReceiptText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  UserRoundCog,
  Users,
  WalletCards,
  X
} from "lucide-react";

const SIDEBAR_STORAGE_KEY = "erp-servicos:sidebar-collapsed";

const nav = [
  {
    title: "Dashboard",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }]
  },
  {
    title: "Cadastros",
    items: [
      { href: "/cadastros/clientes", label: "Clientes", icon: Building2 },
      { href: "/cadastros/servicos", label: "Servicos", icon: ClipboardList },
      { href: "/cadastros/contratos", label: "Contratos", icon: FileText, hiddenForSegments: ["otica"] }
    ]
  },
  {
    title: "Operacao",
    items: [
      { href: "/operacao/vendas", label: "Vendas", icon: ShoppingCart },
      { href: "/operacao/estoque", label: "Estoque", icon: Package }
    ]
  },
  {
    title: "Financeiro",
    items: [
      { href: "/financeiro/entradas", label: "Entradas", icon: Banknote },
      { href: "/financeiro/saidas", label: "Saidas", icon: WalletCards },
      { href: "/financeiro/comissoes", label: "Comissoes", icon: HandCoins },
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: ChartNoAxesCombined },
      { href: "/financeiro/conciliacao", label: "Conciliacao", icon: ShieldCheck },
      { href: "/financeiro/boletos-cobrancas", label: "Boletos/Cobrancas", icon: Barcode }
    ]
  },
  {
    title: "Fiscal",
    items: [
      { href: "/fiscal/emissao-nfse", label: "Emissao de NFS-e", icon: FilePlus2 },
      { href: "/fiscal/notas-emitidas", label: "Notas Emitidas", icon: ReceiptText }
    ]
  },
  {
    title: "Analises",
    items: [{ href: "/relatorios", label: "Relatorios", icon: BarChart3 }]
  },
  {
    title: "Configuracoes",
    items: [
      { href: "/configuracoes/certificado-digital", label: "Certificado Digital", icon: BadgeCheck },
      { href: "/configuracoes/usuarios", label: "Usuarios", icon: Users },
      { href: "/configuracoes/grupos-de-acesso", label: "Grupos de Acesso", icon: UserRoundCog },
      { href: "/configuracoes/apis", label: "APIs", icon: Plug },
      { href: "/configuracoes/emails", label: "E-mails", icon: Mail },
      { href: "/configuracoes/gerais", label: "Gerais", icon: Settings }
    ]
  }
];

type AppShellClientProps = {
  children: React.ReactNode;
  displayName: string;
  displayEmail: string;
  displayRole: string;
  activeCompanyName?: string | null;
  activeCompanySegment?: string | null;
  isSystemAdmin?: boolean;
};

const segmentLabels: Record<string, string> = {
  tecnologia: "Tecnologia",
  otica: "Otica",
  generico: "Generico"
};

export function AppShellClient({
  children,
  displayName,
  displayEmail,
  displayRole,
  activeCompanyName,
  activeCompanySegment,
  isSystemAdmin = false
}: AppShellClientProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const segmentNav = nav
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.hiddenForSegments?.includes(activeCompanySegment || ""))
    }))
    .filter((group) => group.items.length);
  const visibleNav = isSystemAdmin
    ? [
      {
        title: "Admin",
        items: [{ href: "/admin/tenants", label: "Tenants", icon: Building }]
      },
      ...segmentNav
    ]
    : segmentNav;

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true");
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    document.body.classList.add("sidebar-lock");
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.classList.remove("sidebar-lock");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  };

  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}${mobileOpen ? " sidebar-open" : ""}`}>
      <aside className="sidebar" id="app-sidebar" aria-label="Modulos">
        <div className="sidebar-header">
          <Link className="sidebar-brand" href="/dashboard" title="Mundo Livre Tecnologia">
            <span className="sidebar-logo" aria-hidden="true">
              <Image src="/assets/mundo-livre-shield.svg" alt="" width={34} height={34} priority />
            </span>
            <span className="sidebar-brand-copy">
              <strong>Mundo Livre</strong>
              <small>Gestao de servicos</small>
            </span>
          </Link>
          <button
            className="icon-button sidebar-toggle"
            type="button"
            title={collapsed ? "Expandir modulos" : "Recolher modulos"}
            aria-label={collapsed ? "Expandir modulos" : "Recolher modulos"}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            onClick={toggleCollapsed}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
          <button
            className="icon-button sidebar-mobile-close"
            type="button"
            title="Fechar menu"
            aria-label="Fechar menu"
            onClick={() => setMobileOpen(false)}
          >
            <X />
          </button>
        </div>

        <div className="sidebar-nav">
          {visibleNav.map((group) => (
            <nav className="nav-group" key={group.title} aria-label={group.title}>
              <strong className="nav-group-title">{group.title}</strong>
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));

                return (
                  <Link
                    className={`nav-link${isActive ? " active" : ""}`}
                    href={item.href}
                    key={item.href}
                    title={collapsed ? item.label : undefined}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          ))}
        </div>
      </aside>

      <button
        className="sidebar-backdrop"
        type="button"
        aria-label="Fechar menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-context">
            <button
              className="icon-button mobile-menu-button"
              type="button"
              title="Abrir menu"
              aria-label="Abrir menu"
              aria-expanded={mobileOpen}
              aria-controls="app-sidebar"
              onClick={() => setMobileOpen(true)}
            >
              <Menu />
            </button>
            <div>
              <strong>Operacao</strong>
              <div className="muted">
                {activeCompanyName
                  ? `${activeCompanyName} · ${segmentLabels[activeCompanySegment || ""] || activeCompanySegment || "segmento nao definido"}`
                  : "Financeiro, fiscal e cobrancas em ambiente seguro"}
              </div>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="user-context" title={`${displayEmail} · ${displayRole}`}>
              <span className="user-avatar" aria-hidden="true">{displayName.trim().charAt(0).toUpperCase() || "U"}</span>
              <span className="user-copy">
                <strong>{displayName}</strong>
                <small>{displayEmail} · {displayRole}</small>
              </span>
            </div>
            <form action="/api/auth/logout" method="post">
              <button className="icon-button" type="submit" title="Sair" aria-label="Sair">
                <LogOut />
              </button>
            </form>
          </div>
        </header>
        <section className="content">{children}</section>
      </main>
    </div>
  );
}
