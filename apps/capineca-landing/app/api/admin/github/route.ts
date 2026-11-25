import { ensureDatabase } from "../../../../db";
import { getAdminAccess } from "../../../../lib/admin-auth";
import { deleteGitHubToken, getGitHubConnectionState, saveGitHubToken } from "../../../../lib/github-media";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  await ensureDatabase();
  try { return Response.json(await getGitHubConnectionState(), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível verificar o GitHub." }, { status: 503 }); }
}

export async function PUT(request: Request) {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token || token.length > 300) return Response.json({ error: "Informe um token do GitHub válido." }, { status: 400 });
  if (!process.env.CAPINECA_GITHUB_ENCRYPTION_KEY) return Response.json({ error: "Falta configurar a chave secreta de criptografia nas variáveis do site." }, { status: 503 });

  const response = await fetch(`https://api.github.com/repos/${process.env.CAPINECA_GITHUB_REPO?.trim() || "osvaldosereia/canecafacil"}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "CapiNeca-Site-Admin" },
  });
  if (!response.ok) return Response.json({ error: response.status === 401 ? "O token foi recusado pelo GitHub." : "O token não consegue acessar o repositório configurado." }, { status: 400 });
  const repoInfo = await response.json() as { permissions?: { push?: boolean } };
  if (repoInfo.permissions?.push === false) return Response.json({ error: "O token acessa o repositório, mas precisa da permissão Contents: Read and write." }, { status: 400 });
  try {
    await ensureDatabase();
    await saveGitHubToken(token);
    return Response.json(await getGitHubConnectionState(), { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível proteger o token." }, { status: 503 }); }
}

export async function DELETE() {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  await ensureDatabase();
  await deleteGitHubToken();
  return Response.json({ connected: false });
}
