import { getChatGPTUser } from "../app/chatgpt-auth";

export async function getAdminAccess() {
  const user = await getChatGPTUser();
  const development = process.env.NODE_ENV !== "production";
  if (development && !user) return { ok: true as const, email: "administrador@local" };
  if (!user) return { ok: false as const, status: 401, error: "Entre com a conta administradora." };
  const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map(item => item.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return { ok: false as const, status: 503, error: "O acesso administrativo ainda não foi configurado." };
  if (!allowed.includes(user.email.toLowerCase())) return { ok: false as const, status: 403, error: "Esta conta não tem acesso ao painel." };
  return { ok: true as const, email: user.email };
}
