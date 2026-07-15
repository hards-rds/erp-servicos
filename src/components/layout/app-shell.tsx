import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  Banknote,
  Building2,
  ChevronLeft,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";

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
      { href: "/cadastros/contratos", label: "Contratos", icon: FileText }
    ]
  },
  {
    title: "Financeiro",
    items: [
      { href: "/financeiro/entradas", label: "Entradas", icon: ReceiptText },
      { href: "/financeiro/saidas", label: "Saidas", icon: Banknote },
      { href: "/financeiro/fluxo-de-caixa", label: "Fluxo de Caixa", icon: LayoutDashboard },
      { href: "/financeiro/conciliacao", label: "Conciliacao", icon: ShieldCheck },
      { href: "/financeiro/boletos-cobrancas", label: "Boletos/Cobrancas", icon: ReceiptText }
    ]
  },
  {
    title: "Fiscal",
    items: [
      { href: "/fiscal/emissao-nfse", label: "Emissao de NFS-e", icon: FileText },
      { href: "/fiscal/notas-emitidas", label: "Notas Emitidas", icon: ReceiptText }
    ]
  },
  {
    title: "Configuracoes",
    items: [
      { href: "/configuracoes/certificado-digital", label: "Certificado Digital", icon: ShieldCheck },
      { href: "/configuracoes/usuarios", label: "Usuarios", icon: Users },
      { href: "/configuracoes/grupos-de-acesso", label: "Grupos de Acesso", icon: Users },
      { href: "/configuracoes/apis", label: "APIs", icon: Settings },
      { href: "/configuracoes/emails", label: "E-mails", icon: Settings },
      { href: "/configuracoes/gerais", label: "Gerais", icon: Settings }
    ]
  }
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from("profiles").select("name,email,role,company_id").eq("id", user.id).maybeSingle()
    : { data: null };
  const displayEmail = profile?.email || user?.email || "Usuário";
  const displayRole = profile?.role === "master" ? "master" : profile?.role || "sem perfil";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Modulos">
        <div className="sidebar-header">
          <div>
            <strong>ERP Servicos</strong>
            <div className="muted">Mundo Livre tecnologia</div>
          </div>
          <button className="icon-button" type="button" title="Recolher modulos" aria-label="Recolher modulos">
            <ChevronLeft />
          </button>
        </div>
        {nav.map((group) => (
          <nav className="nav-group" key={group.title} aria-label={group.title}>
            <strong>{group.title}</strong>
            {group.items.map((item) => {
              const Icon = item.icon;
              return (
                <Link className="nav-link" href={item.href} key={item.href}>
                  <Icon size={17} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        ))}
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <strong>Operacao</strong>
            <div className="muted">Ambiente seguro para financeiro, fiscal e cobrancas</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="badge">{displayEmail} · {displayRole}</span>
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
