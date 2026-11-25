import { ensureDatabase } from "../../../../db";
import { getAdminAccess } from "../../../../lib/admin-auth";

type Check = { id: string; label: string; status: "ready" | "attention" | "optional"; description: string };

const filled = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));

export async function GET() {
  const access = await getAdminAccess();
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });

  let databaseReady = true;
  try { await ensureDatabase(); }
  catch { databaseReady = false; }
  let storageReady = true;
  try { const { env } = await import("cloudflare:workers"); storageReady = Boolean(env.BUCKET); }
  catch { storageReady = false; }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
  let customDomainReady = false;
  try {
    const host = new URL(siteUrl).hostname.toLowerCase();
    customDomainReady = host === "capineca.com.br" || host === "www.capineca.com.br";
  } catch { /* o domínio ainda não foi configurado */ }
  const generatorConfigured = filled("SUPABASE_URL", "SUPABASE_ANON_KEY");
  const whatsappConfigured = filled("CAPINECA_WHATSAPP_NUMBER");
  const checks: Check[] = [
    { id: "database", label: "Painel operacional", status: databaseReady ? "ready" : "attention", description: databaseReady ? "O painel interno está conectado." : "O banco operacional não respondeu." },
    { id: "storage", label: "Artes e arquivos", status: storageReady ? "ready" : "attention", description: storageReady ? "O armazenamento do site está disponível." : "O armazenamento de imagens não está disponível." },
    { id: "capineca-generator", label: "Pesquisa e geração de conceitos", status: generatorConfigured ? "ready" : "attention", description: generatorConfigured ? "Gerador configurado para pesquisar a marca e criar quatro propostas." : "Falta conectar a integração de pesquisa e geração existente." },
    { id: "whatsapp", label: "WhatsApp exclusivo", status: whatsappConfigured ? "ready" : "attention", description: whatsappConfigured ? "O número da CapiNeca está configurado para receber pedidos de orçamento." : "Aguardando o novo número comercial; a página copia a mensagem de orçamento enquanto isso." },
    { id: "domain", label: "Domínio principal", status: customDomainReady ? "ready" : "attention", description: customDomainReady ? `URL canônica configurada em ${siteUrl}.` : "www.capineca.com.br será ativado quando o registro e o DNS forem concluídos." },
    { id: "local-delivery", label: "Entrega local", status: "ready", description: "Entrega grátis em Cuiabá e Várzea Grande; outras localidades são confirmadas no orçamento." },
    { id: "online-checkout", label: "Pagamento online", status: "optional", description: "Desativado conforme o modelo comercial. O pedido é combinado no WhatsApp; cartão em até 3x sem juros." },
  ];
  return Response.json({ checks, ready: checks.filter(check => check.status === "ready").length, blockers: checks.filter(check => check.status === "attention").length }, { headers: { "cache-control": "no-store" } });
}
