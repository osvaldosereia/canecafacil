"use client";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { DEFAULT_SITE_CONTENT, type CapinecaSiteContent, type PortfolioSample } from "../../lib/capineca-content";

type Tab = "overview" | "leads" | "site" | "integrations";
type Lead = { id: string; company: string; sector: string; purpose: string; quantity: number; city: string; businessPhone: string; website: string; customizationIdea: string; contactName: string; contactPhone: string; status: string; notes: string; createdAt: string };
type GitHubStatus = { connected: boolean; updatedAt: string | null; repo: string; encryptionReady: boolean };
const statusLabel: Record<string, string> = { new: "Novo", contacted: "Em contato", quoted: "Orçamento enviado", closed: "Fechado", archived: "Arquivado" };
const dateLabel = (value: string) => {
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(normalized));
};
const digits = (value: string) => value.replace(/\D/g, "");
const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);

export default function SiteAdminDashboard({ userDisplayName }: { userDisplayName: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [content, setContent] = useState<CapinecaSiteContent>(DEFAULT_SITE_CONTENT);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [github, setGithub] = useState<GitHubStatus>({ connected: false, updatedAt: null, repo: "osvaldosereia/canecafacil", encryptionReady: false });
  const [query, setQuery] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setError("");
    try {
      const [siteResponse, leadsResponse, githubResponse] = await Promise.all([
        fetch("/api/admin/site-content", { cache: "no-store" }), fetch("/api/admin/leads", { cache: "no-store" }), fetch("/api/admin/github", { cache: "no-store" }),
      ]);
      const [siteResult, leadResult, githubResult] = await Promise.all([siteResponse.json(), leadsResponse.json(), githubResponse.json()]) as [ { content?: CapinecaSiteContent; error?: string }, { leads?: Lead[]; error?: string }, GitHubStatus & { error?: string } ];
      if (!siteResponse.ok) throw new Error(siteResult.error || "Não foi possível carregar o conteúdo do site.");
      if (!leadsResponse.ok) throw new Error(leadResult.error || "Não foi possível carregar os orçamentos.");
      if (!githubResponse.ok) throw new Error(githubResult.error || "Não foi possível conferir o GitHub.");
      setContent(siteResult.content ?? DEFAULT_SITE_CONTENT); setLeads(leadResult.leads ?? []); setGithub(githubResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar o painel."); }
    finally { setLoading(false); }
  };

  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 2800); return () => window.clearTimeout(timer); }, [notice]);

  const filteredLeads = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    return leads.filter(lead => `${lead.company} ${lead.contactName} ${lead.contactPhone} ${lead.sector} ${lead.website}`.toLocaleLowerCase("pt-BR").includes(term));
  }, [leads, query]);
  const pendingLeads = leads.filter(lead => ["new", "contacted"].includes(lead.status)).length;
  const title = tab === "overview" ? "Visão geral" : tab === "leads" ? "Orçamentos" : tab === "site" ? "Landing page e vitrine" : "Integrações";

  const saveContent = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/site-content", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(content) });
      const result = await response.json() as { content?: CapinecaSiteContent; error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar as alterações.");
      if (result.content) setContent(result.content);
      setNotice("Landing page atualizada.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível salvar."); }
    finally { setSaving(false); }
  };

  const updateSample = (index: number, patch: Partial<PortfolioSample>) => setContent(current => ({ ...current, portfolio: current.portfolio.map((sample, sampleIndex) => sampleIndex === index ? { ...sample, ...patch } : sample) }));

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>, slot: "hero" | "showcase", index?: number) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const key = slot === "hero" ? "hero" : `sample-${index}`;
    setUploading(key); setError("");
    try {
      const form = new FormData(); form.set("file", file); form.set("slot", slot);
      const response = await fetch("/api/admin/media", { method: "POST", body: form });
      const result = await response.json() as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Não foi possível publicar a imagem no GitHub.");
      if (slot === "hero") setContent(current => ({ ...current, heroImage: result.url! }));
      else if (index !== undefined) updateSample(index, { imageUrl: result.url });
      setNotice("Imagem publicada no GitHub. Salve o conteúdo para exibi-la no site.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao enviar a imagem."); }
    finally { setUploading(""); }
  };

  const updateLead = async (lead: Lead) => {
    const response = await fetch(`/api/admin/leads/${lead.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: lead.status, notes: lead.notes }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice(result.error || "Não foi possível salvar o orçamento."); return; }
    setNotice("Orçamento atualizado."); await load();
  };

  const connectGitHub = async () => {
    if (!token.trim()) { setError("Cole o token de acesso do GitHub."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/github", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as GitHubStatus & { error?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível conectar o GitHub.");
      setGithub(result); setToken(""); setNotice("GitHub conectado. As novas imagens serão publicadas no repositório.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível conectar o GitHub."); }
    finally { setSaving(false); }
  };

  const disconnectGitHub = async () => {
    const response = await fetch("/api/admin/github", { method: "DELETE" });
    const result = await response.json() as GitHubStatus & { error?: string };
    if (!response.ok) { setError(result.error || "Não foi possível desconectar o GitHub."); return; }
    setGithub(current => ({ ...current, connected: false, updatedAt: null })); setNotice("Conexão do GitHub removida.");
  };

  return <main className="cn-admin-shell">
    <aside className="cn-admin-sidebar"><Link className="cn-admin-brand" href="/"><Image src="/brand/capineca-logo.webp" alt="" width={46} height={46} unoptimized /><span>CapiNeca<small>PAINEL DA MARCA</small></span></Link><nav aria-label="Menu do painel">
      {([ ["overview", "⌂", "Visão geral"], ["leads", "▤", "Orçamentos"], ["site", "▧", "Site e imagens"], ["integrations", "⚙", "Integrações"] ] as [Tab, string, string][]).map(([value, icon, label]) => <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}><span>{icon}</span>{label}{value === "leads" && pendingLeads > 0 && <b>{pendingLeads}</b>}</button>)}
    </nav><div className="cn-admin-user"><span>{userDisplayName.slice(0, 1).toUpperCase()}</span><div><strong>{userDisplayName}</strong><small>Administrador</small></div></div></aside>
    <section className="cn-admin-main"><header className="cn-admin-header"><div><small>CAPINECA · ADMINISTRAÇÃO</small><h1>{title}</h1><p>Gerencie sua vitrine e acompanhe quem pediu uma proposta.</p></div><div><button onClick={() => { setLoading(true); load(); }}>↻ Atualizar</button><Link href="/">Ver site ↗</Link></div></header>
      {error && <div className="cn-admin-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
      {loading ? <div className="cn-admin-loading"><span>✳</span>Carregando painel…</div> : <>
        {tab === "overview" && <>
          <div className="cn-admin-metrics"><article><small>Pedidos de orçamento</small><strong>{leads.length}</strong><span>registrados pela landing page</span></article><article><small>Precisam de retorno</small><strong>{pendingLeads}</strong><span>novos ou em contato</span></article><article><small>Imagens da vitrine</small><strong>{content.portfolio.filter(sample => sample.imageUrl).length + (content.heroImage ? 1 : 0)}<i>/ 5</i></strong><span>imagem inicial e quatro modelos</span></article><article><small>Imagens no GitHub</small><strong>{github.connected ? "Ativo" : "Pendente"}</strong><span>{github.connected ? github.repo : "Conecte para substituir fotos"}</span></article></div>
          <div className="cn-admin-overview-grid"><section className="cn-admin-card"><header><div><span>LEADS RECENTES</span><small>Pedidos de orçamento vindos do site</small></div><button onClick={() => setTab("leads")}>Ver todos →</button></header>{leads.slice(0, 5).map(lead => <button className="cn-admin-lead-summary" key={lead.id} onClick={() => setTab("leads")}><span>{lead.contactName.slice(0, 1).toUpperCase()}</span><div><strong>{lead.company}</strong><small>{lead.contactName} · {lead.quantity} un.</small></div><i className={`lead-status ${lead.status}`}>{statusLabel[lead.status] || lead.status}</i></button>)}{!leads.length && <p className="cn-admin-empty">Os próximos pedidos de orçamento aparecerão aqui.</p>}</section><section className="cn-admin-card cn-admin-quick"><span>PUBLICAÇÃO DO SITE</span><h2>Imagem principal e quatro exemplos</h2><p>As fotos públicas ficam no GitHub. A página guarda apenas os endereços e os textos de cada peça.</p><button onClick={() => setTab("site")}>Editar vitrine →</button><small>Supabase não é usado para guardar imagens do site.</small></section></div>
        </>}
        {tab === "leads" && <section className="cn-admin-card cn-admin-leads"><header><div><span>CAIXA DE ORÇAMENTOS</span><small>{leads.length} solicitação{leads.length === 1 ? "" : "ões"} recebida{leads.length === 1 ? "" : "s"}</small></div><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar empresa, nome ou telefone" /></header>
          {filteredLeads.length ? <div className="cn-admin-lead-grid">{filteredLeads.map(lead => <article key={lead.id} className="cn-admin-lead-card"><div className="lead-card-top"><span>{statusLabel[lead.status] || lead.status}</span><small>{dateLabel(lead.createdAt)}</small></div><h2>{lead.company}</h2><p className="lead-person">{lead.contactName} · {lead.contactPhone}</p><dl><div><dt>Segmento</dt><dd>{lead.sector}</dd></div><div><dt>Ocasião</dt><dd>{lead.purpose}</dd></div><div><dt>Quantidade</dt><dd>{lead.quantity} unidades · {brl(lead.quantity * content.unitPriceCents)}</dd></div><div><dt>Cidade</dt><dd>{lead.city || "A confirmar"}</dd></div>{lead.businessPhone && <div><dt>Telefone na caneca</dt><dd>{lead.businessPhone}</dd></div>}{lead.website && <div><dt>Site na caneca</dt><dd>{lead.website}</dd></div>}</dl>{lead.customizationIdea && <blockquote>“{lead.customizationIdea}”</blockquote>}
            <label className="cn-admin-field">Etapa<select value={lead.status} onChange={event => setLeads(current => current.map(item => item.id === lead.id ? { ...item, status: event.target.value } : item))}>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="cn-admin-field">Observações internas<textarea value={lead.notes} onChange={event => setLeads(current => current.map(item => item.id === lead.id ? { ...item, notes: event.target.value } : item))} rows={2} placeholder="Próximo passo, prazo ou detalhe do orçamento" /></label><div className="lead-card-actions"><a href={`https://wa.me/${digits(lead.contactPhone)}?text=${encodeURIComponent(`Olá, ${lead.contactName}! Aqui é da CapiNeca. Recebemos seu pedido de orçamento para ${lead.quantity} canecas personalizadas para ${lead.company}. Podemos conversar sobre a proposta?`)}`} target="_blank" rel="noreferrer">Abrir WhatsApp ↗</a><button onClick={() => updateLead(lead)}>Salvar</button></div></article>)}</div> : <p className="cn-admin-empty">Nenhum orçamento corresponde a essa busca.</p>}
        </section>}
        {tab === "site" && <div className="cn-admin-editor"><section className="cn-admin-card"><header><div><span>PRIMEIRA IMPRESSÃO</span><small>Imagem e chamada principal da landing page</small></div></header><div className="cn-admin-hero-editor"><div><img src={content.heroImage} alt="Prévia da imagem principal do site" /><label className="cn-admin-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => uploadImage(event, "hero")} />{uploading === "hero" ? "Enviando para o GitHub…" : "Trocar imagem principal"}</label></div><div className="cn-admin-editor-fields"><label className="cn-admin-field">Chamada principal<input value={content.heroTitle} onChange={event => setContent(current => ({ ...current, heroTitle: event.target.value }))} maxLength={120} /></label><label className="cn-admin-field">Frase em destaque<input value={content.heroEmphasis} onChange={event => setContent(current => ({ ...current, heroEmphasis: event.target.value }))} maxLength={120} /></label><label className="cn-admin-field">Texto de apoio<textarea value={content.heroDescription} onChange={event => setContent(current => ({ ...current, heroDescription: event.target.value }))} rows={3} maxLength={300} /></label></div></div></section>
          <section className="cn-admin-card"><header><div><span>VITRINE · QUATRO CANECAS</span><small>Exemplos fictícios para advogados, saúde, arquitetura e eventos</small></div></header><div className="cn-admin-sample-grid">{content.portfolio.map((sample, index) => <article key={index}><div className="sample-preview">{sample.imageUrl ? <img src={sample.imageUrl} alt={`Caneca de demonstração ${sample.title}`} /> : <div><Image src="/images/capineca-blank-pair.webp" alt="Duas canecas brancas para personalização" width={240} height={240} unoptimized /><b>{sample.brand}</b><small>Prévia ilustrativa</small></div>}</div><div className="cn-admin-editor-fields"><label className="cn-admin-field">Empresa fictícia<input value={sample.title} onChange={event => updateSample(index, { title: event.target.value, brand: event.target.value.split(" · ")[0] })} maxLength={100} /></label><label className="cn-admin-field">Identificação do exemplo<input value={sample.label} onChange={event => updateSample(index, { label: event.target.value })} maxLength={80} /></label><label className="cn-admin-field">Nome curto / logo<input value={sample.brand} onChange={event => updateSample(index, { brand: event.target.value, mark: event.target.value.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() })} maxLength={80} /></label><div className="sample-pair-fields"><label className="cn-admin-field">Contato fictício<input value={sample.phone} onChange={event => updateSample(index, { phone: event.target.value })} maxLength={30} /></label><label className="cn-admin-field">Site fictício<input value={sample.website} onChange={event => updateSample(index, { website: event.target.value })} maxLength={120} /></label></div><label className="cn-admin-upload"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => uploadImage(event, "showcase", index)} />{uploading === `sample-${index}` ? "Enviando para o GitHub…" : "Trocar imagem deste modelo"}</label><small className="cn-admin-helper">A imagem deve mostrar canecas brancas, alça branca e arte colorida nos dois lados. PNG, JPG ou WebP até 8 MB.</small></div></article>)}</div></section>
          <section className="cn-admin-card"><header><div><span>OFERTA E CONTATO</span><small>Esses dados aparecem na página e na estimativa</small></div></header><div className="cn-admin-settings-grid"><label className="cn-admin-field">Preço por unidade (R$)<input type="number" min="0.01" step="0.01" value={(content.unitPriceCents / 100).toFixed(2)} onChange={event => setContent(current => ({ ...current, unitPriceCents: Math.round(Number(event.target.value) * 100) || 0 }))} /></label><label className="cn-admin-field">Pedido mínimo<input type="number" min="1" step="1" value={content.minQuantity} onChange={event => setContent(current => ({ ...current, minQuantity: Number(event.target.value) || 1 }))} /></label><label className="cn-admin-field">Cidades com entrega grátis<input value={content.deliveryCities} onChange={event => setContent(current => ({ ...current, deliveryCities: event.target.value }))} maxLength={100} /></label><label className="cn-admin-field">Condição do cartão<input value={content.installmentText} onChange={event => setContent(current => ({ ...current, installmentText: event.target.value }))} maxLength={100} /></label><label className="cn-admin-field">WhatsApp comercial<input value={content.whatsappNumber} onChange={event => setContent(current => ({ ...current, whatsappNumber: event.target.value }))} placeholder="(65) 99999-9999" inputMode="tel" maxLength={30} /></label><label className="cn-admin-field">Domínio do site<input value={content.websiteDomain} onChange={event => setContent(current => ({ ...current, websiteDomain: event.target.value }))} maxLength={120} /></label></div></section>
          <div className="cn-admin-savebar"><span>A imagem é publicada no GitHub assim que enviada. Salve para atualizar a página.</span><button disabled={saving} onClick={saveContent}>{saving ? "Salvando…" : "Salvar alterações do site"}</button></div>
        </div>}
        {tab === "integrations" && <div className="cn-admin-integrations"><section className="cn-admin-card github-card"><header><div><span>PUBLICAÇÃO DE IMAGENS NO GITHUB</span><small>Fotos da landing page e da vitrine</small></div><i className={github.connected ? "ready" : "pending"}>{github.connected ? "Conectado" : "Configuração necessária"}</i></header><p>As imagens enviadas pelo painel ficam no repositório <strong>{github.repo}</strong>. O site salva apenas o endereço público da imagem. A conexão usa um token com acesso somente a esse repositório e permissão <b>Contents: Read and write</b>.</p>{github.connected ? <div className="cn-admin-connected"><span>✓</span><div><strong>Repositório conectado</strong><small>Token criptografado no ambiente do site. Última conexão: {github.updatedAt ? dateLabel(github.updatedAt) : "ativa"}.</small></div><button onClick={disconnectGitHub}>Remover conexão</button></div> : <><label className="cn-admin-field">Token fine-grained do GitHub<input type="password" value={token} onChange={event => setToken(event.target.value)} autoComplete="new-password" placeholder="Cole aqui o token; ele não será exibido depois de salvo" /></label><button className="cn-admin-primary" disabled={saving || !github.encryptionReady} onClick={connectGitHub}>{saving ? "Conectando…" : "Conectar GitHub"}</button>{!github.encryptionReady && <small className="cn-admin-warning">A chave de criptografia ainda precisa ser configurada como segredo nas variáveis do Site. A conexão só será liberada depois disso.</small>}<small className="cn-admin-helper">Crie o token em GitHub → Settings → Developer settings → Fine-grained personal access tokens. Selecione apenas o repositório indicado e conceda Contents: Read and write. Não envie o token por mensagem.</small></>}</section>
          <section className="cn-admin-card"><header><div><span>GERAÇÃO DE CONCEITOS</span><small>Pesquisa da marca e quatro propostas para cada briefing</small></div><i className="ready">Ativa</i></header><p>O personalizador continua usando a integração atual para analisar a marca e gerar os mockups. Logos de clientes e imagens privadas permanecem nesse fluxo e não são publicadas no GitHub.</p></section>
          <section className="cn-admin-card"><header><div><span>MODELO COMERCIAL</span><small>Sem pagamento online</small></div><i className="ready">Configurado</i></header><p>O cliente escolhe a proposta e conversa pelo WhatsApp. Preço, pedido mínimo, cidades e contato são editados na seção “Site e imagens”.</p></section></div>}
      </>}
      <footer className="cn-admin-footer"><span>CapiNeca · painel da marca</span><Link href="/admin/legacy">Painel de ecommerce anterior</Link></footer>
    </section>
    {notice && <div className="cn-admin-toast" role="status">{notice}</div>}
  </main>;
}
