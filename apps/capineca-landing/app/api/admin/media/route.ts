import { ensureDatabase } from "../../../../db";
import { getAdminAccess } from "../../../../lib/admin-auth";
import { CAPINECA_GITHUB_REPO, decryptGitHubToken } from "../../../../lib/github-media";

export const dynamic = "force-dynamic";
const maxBytes = 8 * 1024 * 1024;
const allowedTypes: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(request: Request) {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Escolha uma imagem para enviar." }, { status: 400 });
  if (!allowedTypes[file.type]) return Response.json({ error: "Use um arquivo PNG, JPG ou WebP." }, { status: 400 });
  if (file.size <= 0 || file.size > maxBytes) return Response.json({ error: "A imagem deve ter até 8 MB." }, { status: 400 });
  const slot = form?.get("slot") === "hero" ? "hero" : "showcase";

  try {
    await ensureDatabase();
    const token = await decryptGitHubToken();
    if (!token) return Response.json({ error: "Conecte o GitHub no painel antes de enviar imagens." }, { status: 503 });
    const branch = process.env.CAPINECA_GITHUB_BRANCH?.trim() || "main";
    const extension = allowedTypes[file.type];
    const filename = `${slot}-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}.${extension}`;
    const path = `apps/capineca-landing/public/uploads/${filename}`;
    const raw = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < raw.length; offset += 0x8000) binary += String.fromCharCode(...raw.subarray(offset, offset + 0x8000));
    const content = btoa(binary);
    const response = await fetch(`https://api.github.com/repos/${CAPINECA_GITHUB_REPO}/contents/${path}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "CapiNeca-Site-Admin", "content-type": "application/json" },
      body: JSON.stringify({ message: `Add CapiNeca ${slot} image`, content, branch }),
    });
    const result = await response.json().catch(() => ({})) as { content?: { download_url?: string }; message?: string };
    if (!response.ok) return Response.json({ error: response.status === 403 ? "O token precisa da permissão Contents: Read and write." : result.message || "O GitHub não aceitou esta imagem." }, { status: 502 });
    const url = result.content?.download_url || `https://raw.githubusercontent.com/${CAPINECA_GITHUB_REPO}/${branch}/${path}`;
    return Response.json({ url, path }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível enviar a imagem ao GitHub." }, { status: 503 }); }
}
