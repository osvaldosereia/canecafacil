const allowedContentTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const allowedNamespaces = new Set(["models", "art", "mockups"]);
const maxImageBytes = 15 * 1024 * 1024;

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "::1" || host.endsWith(".local")) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  return parts.some(part => part > 255) || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

function safeIdentity(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 140) || crypto.randomUUID();
}

async function bucket() {
  const { env } = await import("cloudflare:workers");
  if (!env.BUCKET) throw new Error("Armazenamento de imagens indisponível.");
  return env.BUCKET;
}

export async function archiveRemoteImage(source: string, namespace: "models" | "art" | "mockups", identity: string) {
  if (!allowedNamespaces.has(namespace)) throw new Error("Destino de imagem inválido.");
  let url: URL;
  try { url = new URL(source); }
  catch { throw new Error("Endereço da imagem inválido."); }
  if (url.protocol !== "https:" || url.username || url.password || isPrivateHost(url.hostname)) throw new Error("A imagem precisa usar um endereço HTTPS público.");

  const response = await fetch(url, { headers: { accept: "image/webp,image/png,image/jpeg" }, signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Não foi possível baixar a imagem (${response.status}).`);
  const contentType = (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const extension = allowedContentTypes.get(contentType);
  if (!extension) throw new Error("Formato de imagem não aceito. Use JPG, PNG ou WebP.");
  const announcedSize = Number(response.headers.get("content-length") || 0);
  if (announcedSize > maxImageBytes) throw new Error("A imagem ultrapassa o limite de 15 MB.");
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > maxImageBytes) throw new Error("A imagem está vazia ou ultrapassa o limite de 15 MB.");

  const fileName = `${safeIdentity(identity)}.${extension}`;
  const objectKey = `${namespace}/${fileName}`;
  const store = await bucket();
  await store.put(objectKey, bytes, {
    httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { sourceHost: url.hostname, archivedAt: new Date().toISOString() },
  });
  return `/media/${namespace}/${fileName}`;
}

export async function getArchivedImage(namespace: string, key: string) {
  if (!allowedNamespaces.has(namespace) || !/^[a-z0-9_-]{1,140}\.(?:jpg|png|webp)$/.test(key)) return null;
  const store = await bucket();
  return store.get(`${namespace}/${key}`);
}
