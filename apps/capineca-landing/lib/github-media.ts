import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { githubCredentials } from "../db/schema";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const credentialId = "github-content-writer";
export const CAPINECA_GITHUB_REPO = process.env.CAPINECA_GITHUB_REPO?.trim() || "osvaldosereia/canecafacil";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = process.env.CAPINECA_GITHUB_ENCRYPTION_KEY;
  if (!secret) throw new Error("A chave de proteção do GitHub ainda não foi configurada no ambiente do site.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptGitHubToken(token: string) {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(token));
  return { encryptedToken: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

export async function decryptGitHubToken() {
  const db = await getDb();
  const [record] = await db.select().from(githubCredentials).where(eq(githubCredentials.id, credentialId)).limit(1);
  if (!record) return null;
  const key = await encryptionKey();
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(record.iv) }, key, fromBase64(record.encryptedToken));
  return decoder.decode(decrypted);
}

export async function saveGitHubToken(token: string) {
  const db = await getDb();
  const encrypted = await encryptGitHubToken(token);
  await db.insert(githubCredentials).values({ id: credentialId, ...encrypted, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({ target: githubCredentials.id, set: { ...encrypted, updatedAt: new Date().toISOString() } });
}

export async function deleteGitHubToken() {
  const db = await getDb();
  await db.delete(githubCredentials).where(eq(githubCredentials.id, credentialId));
}

export async function getGitHubConnectionState() {
  const db = await getDb();
  const [record] = await db.select({ updatedAt: githubCredentials.updatedAt }).from(githubCredentials).where(eq(githubCredentials.id, credentialId)).orderBy(desc(githubCredentials.updatedAt)).limit(1);
  return { connected: Boolean(record), updatedAt: record?.updatedAt ?? null, repo: CAPINECA_GITHUB_REPO, encryptionReady: Boolean(process.env.CAPINECA_GITHUB_ENCRYPTION_KEY) };
}
