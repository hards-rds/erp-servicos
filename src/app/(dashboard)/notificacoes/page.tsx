import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type NotificationRow = { id: string; category: string; severity: string; title: string; message: string; link: string | null; read_at: string | null; created_at: string };

export default async function NotificationsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle() : { data: null };
  const { data } = profile?.company_id ? await supabase.from("app_notifications").select("id,category,severity,title,message,link,read_at,created_at").eq("company_id", profile.company_id).order("created_at", { ascending: false }).limit(100) : { data: [] };
  const notifications = (data || []) as NotificationRow[];
  const unread = notifications.filter((item) => !item.read_at).length;
  return <>
    <PageHeader area="Operacao / Notificacoes" title="Notificacoes" description="Pendencias e resultados das automacoes da empresa ativa." action={unread ? <form action="/api/notificacoes" method="post"><button className="ghost-button" type="submit">Marcar todas como lidas</button></form> : undefined} />
    <section className="table-panel"><div className="table-panel-heading"><div><h2>Central operacional</h2><span className="muted">{unread} nao lidas de {notifications.length} exibidas.</span></div></div><div className="notification-list">
      {notifications.length ? notifications.map((item) => <article className={`notification-item${item.read_at ? " is-read" : ""}`} key={item.id}><div className="notification-copy"><div className="notification-title"><StatusBadge tone={item.severity === "sucesso" ? "success" : item.severity === "erro" || item.severity === "aviso" ? "warning" : "neutral"}>{item.category}</StatusBadge><strong>{item.title}</strong></div><p>{item.message}</p><small className="muted">{new Date(item.created_at).toLocaleString("pt-BR")}</small></div><div className="notification-actions">{item.link ? <a className="ghost-button button-link compact-button" href={item.link}>Abrir</a> : null}{!item.read_at ? <form action="/api/notificacoes" method="post"><input type="hidden" name="notificationId" value={item.id} /><button className="ghost-button compact-button" type="submit">Marcar como lida</button></form> : null}</div></article>) : <div className="empty-state">Nenhuma notificacao operacional.</div>}
    </div></section>
  </>;
}
