import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  createChatApi,
  type BrowserChatMessage,
  type ChatApi,
  type StorefrontCarouselItem,
} from './lib/chat-api.js';

interface AppProps { api?: ChatApi; }
interface DisplayMessage { id: string; sender: 'customer' | 'assistant'; text: string; pending?: boolean; components?: StorefrontCarouselItem[]; }

function carouselFrom(value: unknown): StorefrontCarouselItem[] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const envelope = value as { version?: unknown; components?: unknown };
  if (envelope.version !== 1 || !Array.isArray(envelope.components)) return undefined;
  const component = envelope.components.find((item) => item && typeof item === 'object' && (item as { type?: unknown }).type === 'storefront_carousel') as { items?: unknown } | undefined;
  if (!component || !Array.isArray(component.items)) return undefined;
  return component.items.filter((item): item is StorefrontCarouselItem => Boolean(item && typeof item === 'object' && typeof (item as StorefrontCarouselItem).templateId === 'string' && typeof (item as StorefrontCarouselItem).name === 'string' && Number.isSafeInteger((item as StorefrontCarouselItem).priceCents))).slice(0, 8);
}

function toDisplayMessages(messages: BrowserChatMessage[]): DisplayMessage[] {
  return messages.filter((message) => ['customer', 'ai', 'human'].includes(message.senderType)).map((message) => ({
    id: message.id,
    sender: message.senderType === 'customer' ? 'customer' : 'assistant',
    text: message.textContent ?? '',
    pending: message.processingState === 'processing',
    components: carouselFrom(message.structuredContent),
  })).filter((message) => message.text || message.components?.length);
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function App({ api: injectedApi }: AppProps) {
  const api = useMemo(() => injectedApi ?? createChatApi({ apiUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000' }), [injectedApi]);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [ready, setReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { let active = true; void (async () => { try { await api.startSession(); const history = await api.loadConversation(); if (active) setMessages(toDisplayMessages(history.messages)); } catch { if (active) setNotice('Não consegui recuperar a conversa agora. Você pode tentar novamente.'); } finally { if (active) setReady(true); } })(); return () => { active = false; }; }, [api]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, sending]);

  async function submit(event: FormEvent) {
    event.preventDefault(); const text = draft.trim(); if (!text || sending) return;
    const localCustomerId = `local-customer-${crypto.randomUUID()}`; const localAssistantId = `local-assistant-${crypto.randomUUID()}`;
    setDraft(''); setNotice(null); setSending(true); setMessages((current) => [...current, { id: localCustomerId, sender: 'customer', text }, { id: localAssistantId, sender: 'assistant', text: '', pending: true }]);
    try {
      for await (const eventPart of api.sendTurn(text)) {
        if (eventPart.event === 'text_delta') { const data = eventPart.data as { text?: unknown }; if (typeof data?.text === 'string') setMessages((current) => current.map((message) => message.id === localAssistantId ? { ...message, text: message.text + data.text, pending: true } : message)); }
        if (eventPart.event === 'component') { const items = carouselFrom(eventPart.data); if (items?.length) setMessages((current) => current.map((message) => message.id === localAssistantId ? { ...message, components: items } : message)); }
        if (eventPart.event === 'done') setMessages((current) => current.map((message) => message.id === localAssistantId ? { ...message, pending: false } : message));
        if (eventPart.event === 'error') throw new Error('response_failed');
      }
    } catch { setMessages((current) => current.filter((message) => message.id !== localAssistantId)); setNotice('Tive um problema para responder. Sua mensagem continua aqui; tente enviar novamente.'); } finally { setSending(false); }
  }

  async function selectTemplate(item: StorefrontCarouselItem) {
    if (selecting) return; setSelecting(item.templateId); setNotice(null);
    try { await api.selectStorefrontTemplate(item.templateId); setNotice(`${item.name} foi escolhida para sua criação.`); } catch { setNotice('Não consegui selecionar esse modelo agora. Tente novamente.'); } finally { setSelecting(null); }
  }

  async function handleFile(file: File | undefined) { if (!file) return; setNotice(`Enviando ${file.type.startsWith('audio/') ? 'seu áudio' : 'sua imagem'}…`); try { await api.uploadMedia(file); setNotice(file.type.startsWith('audio/') ? 'Áudio recebido.' : 'Imagem recebida.'); } catch { setNotice('Não consegui enviar esse arquivo. Tente novamente sem perder a conversa.'); } finally { if (fileInputRef.current) fileInputRef.current.value = ''; } }

  return <main className="chat-page"><section className="chat-shell" aria-label="Conversa Caneca Fácil">
    <div className="chat-presence" aria-label="Caneca Fácil"><span className="chat-presence__mark" aria-hidden="true">CF</span><span><strong>Caneca Fácil</strong><small>{ready ? 'criando com você' : 'abrindo sua conversa…'}</small></span></div>
    <div className="conversation" aria-live="polite"><article className="welcome-turn"><p className="welcome-kicker">Oi! <span aria-hidden="true">👋</span></p><h1>Vamos criar uma caneca do seu jeito?</h1><p>Me conta o que você imagina. Se preferir, pode mandar uma foto ou áudio também.</p></article>
      {messages.map((message) => <article key={message.id} className={`message message--${message.sender}`} aria-label={message.sender === 'customer' ? 'Você' : 'Caneca Fácil'}>
        {message.text || message.pending ? <p>{message.text || '…'}</p> : null}
        {message.components?.length ? <div className="storefront-carousel" aria-label="Modelos de caneca">{message.components.map((item) => <div className="storefront-card" key={item.templateId}>{item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : null}<strong>{item.name}</strong>{item.description ? <span>{item.description}</span> : null}<small>{item.capacityMl ? `${item.capacityMl} ml · ` : ''}{brl.format(item.priceCents / 100)}</small><button type="button" disabled={Boolean(selecting)} onClick={() => void selectTemplate(item)}>{selecting === item.templateId ? 'Escolhendo…' : 'Escolher este modelo'}</button></div>)}</div> : null}
      </article>)}
      {notice ? <p className="conversation-notice" role="status">{notice}</p> : null}<div ref={endRef} />
    </div>
    <form className="composer" onSubmit={submit}><input ref={fileInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp,audio/webm,audio/mpeg,audio/mp4,audio/ogg,audio/wav" onChange={(event) => void handleFile(event.currentTarget.files?.[0])} aria-label="Enviar foto ou áudio"/><button className="composer__attach" type="button" onClick={() => fileInputRef.current?.click()} aria-label="Enviar foto ou áudio"><span aria-hidden="true">＋</span></button><textarea value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} rows={1} placeholder="Me conta o que você imagina..." aria-label="Sua mensagem"/><button className="composer__send" type="submit" disabled={!draft.trim() || sending} aria-label="Enviar mensagem"><span aria-hidden="true">↑</span></button></form>
  </section></main>;
}
