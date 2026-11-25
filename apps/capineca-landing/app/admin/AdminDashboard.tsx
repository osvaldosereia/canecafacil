"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Tab = "overview" | "orders" | "production" | "generations" | "models" | "integrations";
type Order = {
  id: string; status: string; paymentStatus: string; quantity: number; totalCents: number; shippingPriceCents: number;
  shippingServiceName: string; shippingCompany: string; shippingMinDays: number | null; shippingMaxDays: number | null;
  postalCode: string; address: string; addressNumber: string; complement: string; district: string; city: string; state: string;
  paymentId: string | null; mode: string; trackingCode: string; trackingUrl: string; adminNotes: string; createdAt: string; updatedAt: string;
  personalizationId: string | null; modelTitle: string | null; artName: string | null; phrase: string | null;
  customerName: string | null; customerEmail: string | null; customerPhone: string | null; artImageUrl: string | null; mugMockupUrl: string | null;
};
type Generation = { id: string; modelTitle: string; artName: string; customerName: string; status: string; mode: string; error: string | null; artImageUrl: string | null; mugMockupUrl: string | null; createdAt: string };
type Model = { id: number; sourceJobId: string | null; title: string; category: string; tags: string[]; imageUrl: string; phrase: string; accent: string; status: "review" | "published" | "inactive" | "rejected"; likes: number; uses: number; createdAt: string; updatedAt: string };
type IntegrationCheck = { id: string; label: string; status: "ready" | "attention" | "optional"; description: string };

const stages = [
  ["awaiting_payment", "Aguardando pagamento"], ["paid", "Pago"], ["awaiting_production", "Aguardando produção"],
  ["in_production", "Em produção"], ["produced", "Produzido"], ["shipped", "Enviado"],
  ["delivered", "Entregue"], ["cancelled", "Cancelado"], ["refunded", "Reembolsado"],
] as const;
const stageName = (status: string) => stages.find(([value]) => value === status)?.[1] ?? status.replaceAll("_", " ");
const modelStatusName = (status: Model["status"]) => ({ review: "Aguardando revisão", published: "Publicado", inactive: "Pausado", rejected: "Rejeitado" })[status];
const money = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const shortDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const sameDay = (value: string) => new Date(value).toDateString() === new Date().toDateString();

export default function AdminDashboard({ userDisplayName }: { userDisplayName: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [orders, setOrders] = useState<Order[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [integrationChecks, setIntegrationChecks] = useState<IntegrationCheck[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [selected, setSelected] = useState<Order | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    setError("");
    try {
      const [operationResponse, modelsResponse, systemResponse] = await Promise.all([fetch("/api/admin/orders", { cache: "no-store" }), fetch("/api/admin/models", { cache: "no-store" }), fetch("/api/admin/system", { cache: "no-store" })]);
      const result = await operationResponse.json() as { orders?: Order[]; generations?: Generation[]; error?: string };
      const modelResult = await modelsResponse.json() as { models?: Model[]; error?: string };
      const systemResult = await systemResponse.json() as { checks?: IntegrationCheck[]; error?: string };
      if (!operationResponse.ok) throw new Error(result.error || "Não foi possível carregar o painel.");
      if (!modelsResponse.ok) throw new Error(modelResult.error || "Não foi possível carregar os modelos.");
      if (!systemResponse.ok) throw new Error(systemResult.error || "Não foi possível verificar as integrações.");
      setOrders(result.orders ?? []); setGenerations(result.generations ?? []); setModels(modelResult.models ?? []); setIntegrationChecks(systemResult.checks ?? []);
      setSelected(current => current ? (result.orders ?? []).find(order => order.id === current.id) ?? null : null);
      setSelectedModel(current => current ? (modelResult.models ?? []).find(model => model.id === current.id) ?? null : null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível carregar o painel."); }
    finally { setLoading(false); }
  };
  useEffect(() => { const initial = window.setTimeout(load, 0); const timer = window.setInterval(load, 30000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, []);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 2400); return () => window.clearTimeout(timer); }, [notice]);

  const visibleOrders = useMemo(() => orders.filter(order => {
    const matchesStatus = filter === "all" || order.status === filter;
    const haystack = `${order.id} ${order.customerName} ${order.customerEmail} ${order.customerPhone} ${order.modelTitle}`.toLowerCase();
    return matchesStatus && haystack.includes(query.trim().toLowerCase());
  }), [orders, filter, query]);
  const metrics = useMemo(() => ({
    today: orders.filter(order => sameDay(order.createdAt)).length,
    paidToday: orders.filter(order => sameDay(order.createdAt) && !["awaiting_payment", "cancelled", "refunded"].includes(order.status)).reduce((sum, order) => sum + order.totalCents, 0),
    production: orders.filter(order => ["paid", "awaiting_production", "in_production"].includes(order.status)).length,
    shipping: orders.filter(order => ["produced", "shipped"].includes(order.status)).length,
  }), [orders]);
  const waitingGenerations = generations.filter(item => ["queued", "processing"].includes(item.status)).length;
  const waitingModels = models.filter(item => item.status === "review").length;
  const integrationBlockers = integrationChecks.filter(item => item.status === "attention").length;
  const productionColumns = [
    { id: "queue", title: "A produzir", statuses: ["paid", "awaiting_production"] },
    { id: "making", title: "Em produção", statuses: ["in_production"] },
    { id: "ready", title: "Prontos para envio", statuses: ["produced"] },
  ];
  const tabTitle = tab === "overview" ? "Visão geral" : tab === "orders" ? "Pedidos" : tab === "production" ? "Produção" : tab === "generations" ? "Personalizações com IA" : tab === "models" ? "Biblioteca de modelos" : "Integrações e lançamento";

  const updateOrder = async (draft: Order) => {
    const response = await fetch(`/api/admin/orders/${draft.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: draft.status, trackingCode: draft.trackingCode, trackingUrl: draft.trackingUrl, adminNotes: draft.adminNotes }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice(result.error || "Não foi possível salvar."); return; }
    setNotice("Pedido atualizado"); await load();
  };

  const updateModel = async (draft: Model, nextStatus = draft.status) => {
    const response = await fetch(`/api/admin/models/${draft.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...draft, status: nextStatus }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) { setNotice(result.error || "Não foi possível salvar o modelo."); return; }
    setNotice(nextStatus === "published" ? "Modelo publicado" : nextStatus === "rejected" ? "Modelo rejeitado" : "Modelo atualizado");
    setSelectedModel(null); await load();
  };

  const orderList = <div className="admin-order-list">{visibleOrders.length ? visibleOrders.map(order => <button key={order.id} className="admin-order-row" onClick={() => setSelected(order)}>
    <span className="order-number">#{order.id.slice(0, 8).toUpperCase()}<small>{shortDate(order.createdAt)}</small></span>
    <span><strong>{order.customerName || "Cliente"}</strong><small>{order.modelTitle || "Caneca personalizada"} · {order.quantity} un.</small></span>
    <b>{money(order.totalCents)}</b><i className={`order-stage ${order.status}`}>{stageName(order.status)}</i><span className="row-arrow">›</span>
  </button>) : <div className="admin-empty"><span>□</span><h2>Nenhum pedido encontrado</h2><p>Ajuste os filtros ou aguarde um novo pedido.</p></div>}</div>;

  const modelList = <div className="admin-model-grid">{models.length ? models.map(model => <article key={model.id} className="admin-model-card">
    <button className="admin-model-open" onClick={() => setSelectedModel(model)} aria-label={`Revisar ${model.title}`}>
      {model.imageUrl ? <img src={model.imageUrl} alt={`Arte ${model.title}`} /> : <div className={`art-placeholder ${model.accent} compact`}><strong>{model.phrase}</strong></div>}
      <span className={`model-review-status ${model.status}`}>{modelStatusName(model.status)}</span>
    </button>
    <div><small>{model.category} · #{model.id}</small><strong>{model.title}</strong><span>{model.tags.map(tag => `#${tag}`).join(" ") || "Sem tags"}</span></div>
    <button onClick={() => setSelectedModel(model)}>{model.status === "review" ? "Revisar modelo" : "Editar modelo"}</button>
  </article>) : <div className="admin-empty"><span>◇</span><h2>Nenhum modelo recebido</h2><p>As novas artes enviadas pela automação aparecerão aqui.</p></div>}</div>;

  return <main className="admin-shell">
    <aside className="admin-sidebar"><Link className="brand admin-brand" href="/"><span className="brand-mark">C</span><span>canecas<small>administração</small></span></Link><nav aria-label="Seções do painel">
      <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>▦ <span>Visão geral</span></button>
      <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>□ <span>Pedidos</span>{orders.length > 0 && <b>{orders.length}</b>}</button>
      <button className={tab === "production" ? "active" : ""} onClick={() => setTab("production")}>▤ <span>Produção</span>{metrics.production > 0 && <b>{metrics.production}</b>}</button>
      <button className={tab === "generations" ? "active" : ""} onClick={() => setTab("generations")}>✦ <span>Personalizações</span>{waitingGenerations > 0 && <b>{waitingGenerations}</b>}</button>
      <button className={tab === "models" ? "active" : ""} onClick={() => setTab("models")}>◇ <span>Modelos</span>{waitingModels > 0 && <b>{waitingModels}</b>}</button>
      <button className={tab === "integrations" ? "active" : ""} onClick={() => setTab("integrations")}>⚙ <span>Integrações</span>{integrationBlockers > 0 && <b>{integrationBlockers}</b>}</button>
    </nav><div className="admin-user"><div>{userDisplayName.slice(0, 2).toUpperCase()}</div><span><strong>{userDisplayName}</strong><small>Administrador</small></span></div></aside>
    <section className="admin-main"><header className="admin-header"><div><span className="eyebrow">OPERAÇÃO EM TEMPO REAL</span><h1>{tabTitle}</h1><p className="demo-label">{tab === "models" ? "Revise as artes oficiais antes de publicar" : tab === "integrations" ? "Estado das conexões; nenhum segredo é exibido" : tab === "production" ? "Acompanhe a produção e a entrega dos pedidos" : "Atualização automática a cada 30 segundos"}</p></div><div className="admin-header-actions"><button onClick={() => { setLoading(true); load(); }}>↻ Atualizar</button><Link href="/">Ver site</Link></div></header>
      {error && <div className="admin-error" role="alert">{error}<button onClick={load}>Tentar novamente</button></div>}
      {loading ? <div className="admin-loading"><span className="magic-loader">✦</span>Carregando operação…</div> : <>
        {tab === "overview" && <><div className="metric-grid"><article><span>Pedidos hoje</span><strong>{metrics.today}</strong><small>entradas registradas</small></article><article><span>Vendas de hoje</span><strong>{money(metrics.paidToday)}</strong><small>pagas ou em atendimento</small></article><article><span>Para produzir</span><strong>{metrics.production}</strong><small>pagos e em produção</small></article><article><span>Para entregar</span><strong>{metrics.shipping}</strong><small>prontos ou enviados</small></article></div><section className="admin-panel"><div className="panel-title"><div><span>Pedidos recentes</span><small>Pagamento, produção e entrega</small></div><button onClick={() => setTab("orders")}>Ver todos</button></div>{orders.length ? <div className="admin-order-list compact">{orders.slice(0, 7).map(order => <button key={order.id} className="admin-order-row" onClick={() => setSelected(order)}><span className="order-number">#{order.id.slice(0, 8).toUpperCase()}<small>{shortDate(order.createdAt)}</small></span><span><strong>{order.customerName}</strong><small>{order.modelTitle} · {order.quantity} un.</small></span><b>{money(order.totalCents)}</b><i className={`order-stage ${order.status}`}>{stageName(order.status)}</i><span className="row-arrow">›</span></button>)}</div> : <div className="admin-empty"><span>□</span><h2>Aguardando o primeiro pedido</h2><p>Os novos pedidos aparecerão automaticamente aqui.</p></div>}</section></>}
        {tab === "orders" && <section className="admin-panel standalone-panel"><div className="admin-tools"><label>Buscar pedido<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cliente, telefone, e-mail ou código" /></label><label>Etapa<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todas as etapas</option>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{orderList}</section>}
        {tab === "production" && <section className="production-board">{productionColumns.map(column => { const columnOrders = orders.filter(order => column.statuses.includes(order.status)); return <article key={column.id}><header><div><span>{column.title}</span><small>{columnOrders.length} pedido{columnOrders.length === 1 ? "" : "s"}</small></div><b>{columnOrders.length}</b></header><div>{columnOrders.length ? columnOrders.map(order => <button key={order.id} onClick={() => setSelected(order)}><span>#{order.id.slice(0, 8).toUpperCase()}</span><strong>{order.customerName || "Cliente"}</strong><small>{order.modelTitle || "Caneca personalizada"} · {order.quantity} un.</small><i>{money(order.totalCents)} · {shortDate(order.createdAt)}</i></button>) : <p>Nenhum pedido nesta etapa.</p>}</div></article>; })}</section>}
        {tab === "generations" && <section className="admin-panel standalone-panel"><div className="panel-title"><div><span>Solicitações de arte</span><small>Status real recebido da automação</small></div></div><div className="admin-generation-list">{generations.length ? generations.map(item => <article key={item.id}><span className={`generation-state ${item.status}`}>✦</span><div><strong>{item.modelTitle}</strong><small>{item.customerName} · {item.artName || "sem nome"} · {shortDate(item.createdAt)}</small>{item.error && <em>{item.error}</em>}</div><b>{item.status === "demo_ready" ? "Prévia demo" : item.status === "ready" ? "Pronta" : item.status === "failed" ? "Falhou" : item.status === "processing" ? "Gerando" : "Na fila"}</b>{item.mugMockupUrl && <a href={item.mugMockupUrl} target="_blank" rel="noreferrer">Ver mockup</a>}</article>) : <div className="admin-empty"><span>✦</span><h2>Nenhuma personalização ainda</h2><p>As solicitações feitas no site aparecerão aqui.</p></div>}</div></section>}
        {tab === "models" && <section className="admin-panel standalone-panel"><div className="panel-title"><div><span>Modelos oficiais</span><small>{waitingModels ? `${waitingModels} aguardando revisão` : "Nenhuma pendência de revisão"}</small></div></div>{modelList}</section>}
        {tab === "integrations" && <section className="integration-panel"><div className="launch-summary"><div><span className="eyebrow">PRONTIDÃO COMERCIAL</span><h2>{integrationBlockers ? `${integrationBlockers} configuração${integrationBlockers === 1 ? "" : "ões"} futura${integrationBlockers === 1 ? "" : "s"}` : "Canais comerciais configurados"}</h2><p>Domínio e WhatsApp ficam pendentes até você concluir o registro e receber o novo número.</p></div><strong>{integrationChecks.filter(item => item.status === "ready").length}/{integrationChecks.filter(item => item.status !== "optional").length}</strong></div><div className="integration-grid">{integrationChecks.map(check => <article key={check.id} className={check.status}><span>{check.status === "ready" ? "✓" : check.status === "optional" ? "○" : "!"}</span><div><strong>{check.label}</strong><p>{check.description}</p></div><small>{check.status === "ready" ? "Pronto" : check.status === "optional" ? "Opcional" : "Atenção"}</small></article>)}</div></section>}
      </>}
    </section>
    {selected && <div className="admin-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><aside className="admin-drawer" aria-label="Detalhes do pedido"><header><div><small>PEDIDO</small><h2>#{selected.id.slice(0, 8).toUpperCase()}</h2></div><button aria-label="Fechar detalhes" onClick={() => setSelected(null)}>×</button></header><div className="drawer-scroll">
      <section className="drawer-art">{selected.mugMockupUrl ? <img src={selected.mugMockupUrl} alt="Mockup da caneca do pedido" /> : <div>✦</div>}<span><strong>{selected.modelTitle}</strong><small>{selected.artName}{selected.phrase ? ` · ${selected.phrase}` : ""}</small></span></section>
      <section className="drawer-data"><h3>Cliente</h3><p><span>Nome</span><b>{selected.customerName}</b></p><p><span>Celular</span><a href={`tel:${selected.customerPhone}`}>{selected.customerPhone}</a></p><p><span>E-mail</span><a href={`mailto:${selected.customerEmail}`}>{selected.customerEmail}</a></p></section>
      <section className="drawer-data"><h3>Pedido e entrega</h3><p><span>Total</span><b>{money(selected.totalCents)}</b></p><p><span>Quantidade</span><b>{selected.quantity} caneca{selected.quantity > 1 ? "s" : ""}</b></p><p><span>Frete</span><b>{selected.shippingServiceName}</b></p><p><span>Endereço</span><b>{selected.address === "Retirada local" ? "Retirada em Cuiabá" : `${selected.address}, ${selected.addressNumber}${selected.complement ? ` · ${selected.complement}` : ""} · ${selected.district} · ${selected.city}/${selected.state} · CEP ${selected.postalCode}`}</b></p></section>
      <section className="drawer-form"><label>Etapa do pedido<select value={selected.status} onChange={event => setSelected({ ...selected, status: event.target.value })}>{stages.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Código de rastreio<input value={selected.trackingCode || ""} onChange={event => setSelected({ ...selected, trackingCode: event.target.value })} placeholder="Opcional" /></label><label>Link de rastreio<input value={selected.trackingUrl || ""} onChange={event => setSelected({ ...selected, trackingUrl: event.target.value })} placeholder="https://…" /></label><label>Observações internas<textarea value={selected.adminNotes || ""} onChange={event => setSelected({ ...selected, adminNotes: event.target.value })} placeholder="Informações para produção ou entrega" rows={4} /></label><button onClick={() => updateOrder(selected)}>Salvar alterações</button></section>
    </div></aside></div>}
    {selectedModel && <div className="admin-drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedModel(null); }}><aside className="admin-drawer" aria-label="Revisão do modelo"><header><div><small>MODELO OFICIAL</small><h2>Revisar #{selectedModel.id}</h2></div><button aria-label="Fechar revisão" onClick={() => setSelectedModel(null)}>×</button></header><div className="drawer-scroll">
      <section className="model-drawer-preview">{selectedModel.imageUrl ? <img src={selectedModel.imageUrl} alt={`Arte ${selectedModel.title}`} /> : <div className={`art-placeholder ${selectedModel.accent}`}><strong>{selectedModel.phrase}</strong></div>}<span className={`model-review-status ${selectedModel.status}`}>{modelStatusName(selectedModel.status)}</span></section>
      <section className="drawer-form"><label>Título<input value={selectedModel.title} onChange={event => setSelectedModel({ ...selectedModel, title: event.target.value })} maxLength={100} /></label><label>Frase-base<input value={selectedModel.phrase} onChange={event => setSelectedModel({ ...selectedModel, phrase: event.target.value })} maxLength={100} /></label><label>Categoria<input value={selectedModel.category} onChange={event => setSelectedModel({ ...selectedModel, category: event.target.value })} maxLength={60} /></label><label>Tags, separadas por vírgula<input value={selectedModel.tags.join(", ")} onChange={event => setSelectedModel({ ...selectedModel, tags: event.target.value.split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 3) })} /></label><label>Cor de apoio<select value={selectedModel.accent} onChange={event => setSelectedModel({ ...selectedModel, accent: event.target.value })}><option value="blue">Azul</option><option value="coral">Coral</option><option value="sage">Verde</option><option value="lavender">Lavanda</option><option value="rose">Rosa</option><option value="coffee">Café</option></select></label><label>Situação<select value={selectedModel.status} onChange={event => setSelectedModel({ ...selectedModel, status: event.target.value as Model["status"] })}><option value="review">Aguardando revisão</option><option value="published">Publicado</option><option value="inactive">Pausado</option><option value="rejected">Rejeitado</option></select></label><div className="model-drawer-actions"><button className="reject-model" onClick={() => updateModel(selectedModel, "rejected")}>Rejeitar</button><button onClick={() => updateModel(selectedModel, selectedModel.status === "review" ? "published" : selectedModel.status)}>{selectedModel.status === "review" ? "Aprovar e publicar" : "Salvar alterações"}</button></div></section>
    </div></aside></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
