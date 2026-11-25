import Link from "next/link";
import type { Metadata } from "next";
import { chatGPTSignInPath, getChatGPTUser } from "../../chatgpt-auth";
import AdminDashboard from "../AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Painel de ecommerce anterior", robots: { index: false, follow: false, noarchive: true } };

export default async function LegacyAdminPage() {
  const user = await getChatGPTUser();
  const development = process.env.NODE_ENV !== "production";
  const allowedEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
  if (!user && !development) return <main className="admin-gate"><div><span className="brand-mark">C</span><small>ÁREA RESTRITA</small><h1>Painel administrativo</h1><p>Entre com a conta autorizada para acessar pedidos e gerações.</p><Link href={chatGPTSignInPath("/admin/legacy")}>Entrar com ChatGPT</Link><Link className="gate-back" href="/">Voltar para o site</Link></div></main>;
  if (!development && allowedEmails.length === 0) return <main className="admin-gate"><div><span className="brand-mark">C</span><small>CONFIGURAÇÃO NECESSÁRIA</small><h1>Cadastre o administrador</h1><p>Defina o e-mail autorizado no ambiente seguro antes de usar o painel.</p><Link className="gate-back" href="/">Voltar para o site</Link></div></main>;
  if (user && allowedEmails.length > 0 && !allowedEmails.includes(user.email.toLowerCase())) return <main className="admin-gate"><div><span className="brand-mark">C</span><small>ACESSO NÃO AUTORIZADO</small><h1>Esta conta não é administradora</h1><p>Use a conta cadastrada para gerenciar a loja.</p><Link className="gate-back" href="/">Voltar para o site</Link></div></main>;
  return <AdminDashboard userDisplayName={user?.fullName ?? user?.email ?? "Administrador local"} />;
}
