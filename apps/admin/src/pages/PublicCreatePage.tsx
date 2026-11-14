import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMockupSideReference } from '../lib/mug-artwork';
import './PublicCreatePage.css';

type ReferenceIdea = {
  id: string;
  title: string;
  category: string;
  symbol: string;
  colors: [string, string];
  url?: string;
};
type ArtVersion = {
  version: number;
  variantIndex?: number;
  url: string;
  configuration?: { mandatoryText?: string[]; artDescription?: string };
};
type Mockup = { version: number; side: 'pair' | 'left' | 'right'; url: string };
type Contact = { name: string; email: string; whatsapp: string };
type PublicRequest = {
  text: string;
  kind: 'name' | 'phrase';
  referenceId: string;
  referenceTitle: string;
  referenceCategory: string;
};
type Creation = {
  projectId: string;
  title: string;
  status: string;
  customerContact?: Contact | null;
  customerSavedVersion?: number | null;
  orderStatus?: string | null;
  publicRequest?: PublicRequest | null;
  referenceUrl?: string | null;
  mandatoryText?: string[];
  artVersions: ArtVersion[];
  mockups: Mockup[];
};
type HistoryItem = {
  projectId: string;
  title: string;
  status: string;
  createdAt: string;
  latestVersion: number | null;
};

const SESSION_KEY = 'caneca-facil-studio-session-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let fallbackSessionId = '';

const referenceIdeas: ReferenceIdea[] = [
  { id: 'flor-01', title: 'Flores delicadas', category: 'Floral', symbol: '🌼', colors: ['#f4d8b6', '#d77982'] },
  { id: 'flor-02', title: 'Jardim tropical', category: 'Floral', symbol: '🌿', colors: ['#cee0bd', '#58866a'] },
  { id: 'flor-03', title: 'Rosas românticas', category: 'Floral', symbol: '🌹', colors: ['#f3c9c9', '#a34055'] },
  { id: 'flor-04', title: 'Borboletas no jardim', category: 'Floral', symbol: '🦋', colors: ['#d7e8f1', '#7c75b8'] },
  { id: 'fe-01', title: 'Fé e esperança', category: 'Fé', symbol: '✝️', colors: ['#f0dfbf', '#9a7543'] },
  { id: 'fe-02', title: 'Paz e oração', category: 'Fé', symbol: '🕊️', colors: ['#e4e9ef', '#8194a7'] },
  { id: 'fe-03', title: 'Devoção mariana', category: 'Fé', symbol: '🌟', colors: ['#d9e3f3', '#596e9c'] },
  { id: 'fe-04', title: 'Bênçãos', category: 'Fé', symbol: '🙏', colors: ['#f0dfd1', '#a47b69'] },
  { id: 'pet-01', title: 'Gatos', category: 'Pets', symbol: '🐈', colors: ['#f1dfcb', '#9b7451'] },
  { id: 'pet-02', title: 'Cachorros', category: 'Pets', symbol: '🐕', colors: ['#e9d8bd', '#906c47'] },
  { id: 'pet-03', title: 'Amor pelos animais', category: 'Pets', symbol: '🐾', colors: ['#d9e9dc', '#638769'] },
  { id: 'pet-04', title: 'Passarinhos', category: 'Pets', symbol: '🐦', colors: ['#d3e9ef', '#5e8e9c'] },
  { id: 'amor-01', title: 'Amor clássico', category: 'Amor', symbol: '💗', colors: ['#f6d4d9', '#bd6278'] },
  { id: 'amor-02', title: 'Casal apaixonado', category: 'Amor', symbol: '💞', colors: ['#f0d6d4', '#ae6d67'] },
  { id: 'amor-03', title: 'Rosas e carinho', category: 'Amor', symbol: '💐', colors: ['#f3e1c8', '#b77a72'] },
  { id: 'amor-04', title: 'Amizade especial', category: 'Amor', symbol: '🫶', colors: ['#f1dfca', '#b08453'] },
  { id: 'natureza-01', title: 'Sol e montanhas', category: 'Natureza', symbol: '🌄', colors: ['#f5d7a6', '#c97850'] },
  { id: 'natureza-02', title: 'Mar tranquilo', category: 'Natureza', symbol: '🌊', colors: ['#cde6e8', '#518b98'] },
  { id: 'natureza-03', title: 'Lua e estrelas', category: 'Natureza', symbol: '🌙', colors: ['#d8d9ef', '#686895'] },
  { id: 'natureza-04', title: 'Folhas naturais', category: 'Natureza', symbol: '🍃', colors: ['#d8e5c8', '#648453'] },
  { id: 'prof-01', title: 'Professora', category: 'Profissões', symbol: '📚', colors: ['#ead8c4', '#8e704e'] },
  { id: 'prof-02', title: 'Enfermagem', category: 'Profissões', symbol: '🩺', colors: ['#d4e9e8', '#568e8b'] },
  { id: 'prof-03', title: 'Médico', category: 'Profissões', symbol: '🩺', colors: ['#dce8f4', '#6483a4'] },
  { id: 'prof-04', title: 'Formatura', category: 'Profissões', symbol: '🎓', colors: ['#dedaf0', '#75648d'] },
  { id: 'esporte-01', title: 'Corrida', category: 'Esportes', symbol: '🏃', colors: ['#d8ead7', '#5d8f68'] },
  { id: 'esporte-02', title: 'Futebol', category: 'Esportes', symbol: '⚽', colors: ['#d8e6ce', '#63804d'] },
  { id: 'esporte-03', title: 'Beach tennis', category: 'Esportes', symbol: '🎾', colors: ['#f0e2bd', '#a78b49'] },
  { id: 'esporte-04', title: 'Academia', category: 'Esportes', symbol: '🏋️', colors: ['#dedfe4', '#656d7a'] },
  { id: 'viagem-01', title: 'Viagem dos sonhos', category: 'Viagens', symbol: '✈️', colors: ['#d6e8f2', '#6689a1'] },
  { id: 'viagem-02', title: 'Praia', category: 'Viagens', symbol: '🏝️', colors: ['#f3e3b8', '#5d9c9a'] },
  { id: 'viagem-03', title: 'Aventura', category: 'Viagens', symbol: '🏕️', colors: ['#e1e1c8', '#78835c'] },
  { id: 'viagem-04', title: 'Céu estrelado', category: 'Viagens', symbol: '🌌', colors: ['#d8d7ed', '#69698e'] },
  { id: 'bebe-01', title: 'Arco-íris', category: 'Bebê', symbol: '🌈', colors: ['#f2dfd0', '#db8f8b'] },
  { id: 'bebe-02', title: 'Ursinho', category: 'Bebê', symbol: '🧸', colors: ['#eadbc8', '#a47e5e'] },
  { id: 'bebe-03', title: 'Estrelinhas', category: 'Bebê', symbol: '⭐', colors: ['#f0e4c8', '#bd9a55'] },
  { id: 'bebe-04', title: 'Jardim encantado', category: 'Bebê', symbol: '🌷', colors: ['#f1d9e4', '#a16b89'] },
];

function sessionId(): string {
  try {
    const old = localStorage.getItem(SESSION_KEY);
    if (old && UUID.test(old)) return old;
    const next = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    fallbackSessionId ||= crypto.randomUUID();
    return fallbackSessionId;
  }
}

async function studio(client: SupabaseClient, body: FormData | Record<string, unknown>): Promise<any> {
  const { data, error } = await client.functions.invoke('caneca-studio', {
    body,
    headers: { 'x-studio-session': sessionId() },
  });
  if (!error) return data;
  let code = 'studio_job_start_failed';
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const result = await context.json() as { error?: unknown };
      if (typeof result.error === 'string') code = result.error;
    } catch { /* Keep the translated fallback. */ }
  }
  throw new Error(code);
}

function svgReference(item: ReferenceIdea): Blob {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="' + item.colors[0] + '"/><stop offset="1" stop-color="' + item.colors[1] + '"/></linearGradient></defs>' +
    '<rect width="800" height="800" rx="92" fill="url(#g)"/><circle cx="400" cy="400" r="264" fill="#fff" fill-opacity=".47"/><circle cx="400" cy="400" r="218" fill="#fff" fill-opacity=".45"/>' +
    '<path d="M132 510c125-90 159-98 268-11 92 74 163 39 268-33v204H132z" fill="#fff" fill-opacity=".31"/>' +
    '<text x="400" y="462" text-anchor="middle" font-size="230" font-family="system-ui, sans-serif">' + item.symbol + '</text>' +
    '<circle cx="186" cy="192" r="14" fill="#fff" fill-opacity=".76"/><circle cx="630" cy="212" r="20" fill="#fff" fill-opacity=".62"/><circle cx="626" cy="622" r="12" fill="#fff" fill-opacity=".72"/>' +
    '</svg>';
  return new Blob([svg], { type: 'image/svg+xml' });
}

async function compressedReference(item: ReferenceIdea): Promise<File> {
  let blob: Blob;
  if (item.url) {
    const response = await fetch(item.url, { mode: 'cors', credentials: 'omit' });
    if (!response.ok) throw new Error('catalog_reference_unavailable');
    blob = await response.blob();
  } else {
    blob = svgReference(item);
  }
  const image = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  const factor = Math.min(1, 900 / image.width, 900 / image.height);
  canvas.width = Math.max(1, Math.round(image.width * factor));
  canvas.height = Math.max(1, Math.round(image.height * factor));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('reference_compression_failed');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42, 0.32]) {
    const result = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (result && result.size <= 100_000) {
      return new File([result], item.id + '.webp', { type: 'image/webp' });
    }
  }
  throw new Error('reference_compression_failed');
}

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
const ready = (job: Creation) => job.status === 'needs_review' || job.status === 'failed';

export function PublicCreatePage({ client }: { client: SupabaseClient }) {
  const [uploadedReferences, setUploadedReferences] = useState<ReferenceIdea[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedReferenceId, setSelectedReferenceId] = useState('');
  const [textKind, setTextKind] = useState<'name' | 'phrase'>('name');
  const [customText, setCustomText] = useState('');
  const [job, setJob] = useState<Creation | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [contact, setContact] = useState<Contact>({ name: '', email: '', whatsapp: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const allReferences = useMemo(() => [...referenceIdeas, ...uploadedReferences], [uploadedReferences]);
  const categories = useMemo(() => ['Todas', ...new Set(allReferences.map((item) => item.category))], [allReferences]);
  const visibleReferences = selectedCategory === 'Todas'
    ? allReferences
    : allReferences.filter((item) => item.category === selectedCategory);
  const chosenArt = job?.artVersions.find((item) => item.version === selectedVersion) ?? null;
  const pairMockup = job?.mockups.find((item) => item.version === selectedVersion && item.side === 'pair') ?? null;
  const options = job?.artVersions.filter((item) => item.variantIndex) ?? [];
  const saved = Boolean(job?.customerSavedVersion && job.customerSavedVersion === selectedVersion);

  function restoreCreation(next: Creation) {
    const selected = next.customerSavedVersion || next.artVersions.find((item) => item.variantIndex)?.version || null;
    const art = next.artVersions.find((item) => item.version === selected);
    const request = next.publicRequest;
    const text = request?.text || art?.configuration?.mandatoryText?.[0] || next.mandatoryText?.[0] || '';
    const referenceId = request?.referenceId || '';
    setJob(next);
    setSelectedVersion(selected);
    setContact(next.customerContact || { name: '', email: '', whatsapp: '' });
    setCustomText(text);
    setTextKind(request?.kind || (/\s/.test(text.trim()) ? 'phrase' : 'name'));
    setSelectedReferenceId(referenceId);
    setSelectedCategory(request?.referenceCategory || 'Todas');
    if (referenceId && next.referenceUrl) {
      setUploadedReferences((current) => current.some((item) => item.id === referenceId) ? current : [
        ...current,
        {
          id: referenceId,
          title: request?.referenceTitle || 'Imagem usada na criação',
          category: request?.referenceCategory || 'Minhas referências',
          symbol: '✦',
          colors: ['#e8dfd0', '#8b9d84'],
          url: next.referenceUrl || undefined,
        },
      ]);
    }
    setBusy(!ready(next));
  }

  useEffect(() => {
    let active = true;
    void studio(client, { action: 'catalog_list' })
      .then((result: { items?: Array<{ id: string; title: string; category: string; url: string }> }) => {
        if (active) setUploadedReferences((current) => {
          const loaded = (result.items || []).map((item) => ({
            id: item.id,
            title: item.title,
            category: item.category,
            symbol: '✦',
            colors: ['#e8dfd0', '#8b9d84'] as [string, string],
            url: item.url,
          }));
          const liveIds = new Set(loaded.map((item) => item.id));
          return [...loaded, ...current.filter((item) => item.url && !liveIds.has(item.id))];
        });
      })
      .catch(() => undefined);
    void studio(client, { action: 'history' })
      .then(async (result: { jobs?: HistoryItem[] }) => {
        if (!active) return;
        const rows = result.jobs || [];
        setHistory(rows);
        if (rows[0]) {
          const latest = await studio(client, { action: 'load', jobId: rows[0].projectId }) as Creation;
          if (active) {
            restoreCreation(latest);
          }
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    if (!job?.projectId || ready(job) || !busy) return;
    let active = true;
    let timer = 0;
    async function advance() {
      try {
        const next = await studio(client, { action: 'advance', jobId: job!.projectId }) as Creation;
        if (!active) return;
        setJob(next);
        if (ready(next)) {
          setBusy(false);
          if (next.status === 'needs_review' && !selectedVersion) {
            setSelectedVersion(next.artVersions.find((item) => item.variantIndex)?.version || null);
          }
          void studio(client, { action: 'history' }).then((value: { jobs?: HistoryItem[] }) => setHistory(value.jobs || [])).catch(() => undefined);
        } else {
          timer = window.setTimeout(advance, next.status === 'needs_review' ? 500 : 1300);
        }
      } catch {
        if (active) {
          setError('Não conseguimos atualizar a criação. Tente abrir sua criação novamente em alguns instantes.');
          timer = window.setTimeout(advance, 5000);
        }
      }
    }
    timer = window.setTimeout(advance, 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [client, job?.projectId, job?.status, busy]);

  async function selectHistory(projectId: string) {
    setBusy(true);
    setError('');
    try {
      const loaded = await studio(client, { action: 'load', jobId: projectId }) as Creation;
      restoreCreation(loaded);
      setNotice('Criação anterior aberta.');
    } catch {
      setBusy(false);
      setError('Não foi possível abrir essa criação. Atualize a página e tente novamente.');
    }
  }

  async function generateArt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const selected = allReferences.find((item) => item.id === selectedReferenceId);
    if (!selected || customText.trim().length < 1) {
      setError('Escolha uma imagem de referência e escreva um nome ou uma frase.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setJob(null);
    setSelectedVersion(null);
    try {
      const reference = await compressedReference(selected);
      const form = new FormData();
      form.set('action', 'start');
      form.set('title', 'Caneca · ' + customText.trim().slice(0, 80));
      form.set('creationMode', 'reference');
      form.set('generationSide', 'both');
      form.set('publicRequest', JSON.stringify({
        text: customText.trim(),
        kind: textKind,
        referenceId: selected.id,
        referenceTitle: selected.title,
        referenceCategory: selected.category,
      }));
      form.set('artDescription',
        'Crie uma arte original para caneca que combine visualmente com a imagem de referência. O nome ou frase exatos ficam centralizados na metade esquerda; uma ilustração original inspirada na referência fica centralizada na metade direita. Fundo branco e acabamento suave nas duas bordas externas.');
      form.set('mandatoryText', customText.trim());
      form.set('reference', reference);
      const created = await studio(client, form) as Creation;
      setJob(created);
      setNotice('Criando três opções diferentes. Esta tela atualiza sozinha.');
    } catch {
      setError('Não foi possível iniciar a criação. Confira a conexão e tente novamente.');
      setBusy(false);
    }
  }

  async function generateMockup() {
    if (!job || !chosenArt || busy) return;
    const normalizedWhatsapp = contact.whatsapp.replace(/\D/g, '');
    if (contact.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) ||
      normalizedWhatsapp.length < 10 || normalizedWhatsapp.length > 15) {
      setError('Informe seu nome, um e-mail válido e o WhatsApp com DDD.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const [leftReference, rightReference] = await Promise.all([
        createMockupSideReference(chosenArt.url, 'left'),
        createMockupSideReference(chosenArt.url, 'right'),
      ]);
      const form = new FormData();
      form.set('action', 'mockups');
      form.set('jobId', job.projectId);
      form.set('version', String(chosenArt.version));
      form.set('customerName', contact.name.trim());
      form.set('customerEmail', contact.email.trim());
      form.set('customerWhatsapp', normalizedWhatsapp);
      form.set('leftReference', leftReference);
      form.set('rightReference', rightReference);
      const updated = await studio(client, form) as Creation;
      setJob(updated);
      setContact(updated.customerContact || { ...contact, whatsapp: normalizedWhatsapp });
      setNotice('Preparando a imagem quadrada com as duas vistas da caneca.');
    } catch {
      setError('Não foi possível criar o mockup. Revise seus dados e tente novamente.');
      setBusy(false);
    }
  }

  async function saveDesign() {
    if (!job || !chosenArt || !pairMockup || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await studio(client, {
        action: 'save_design',
        jobId: job.projectId,
        version: chosenArt.version,
      }) as Creation;
      setJob(updated);
      setNotice('Arte salva. Sua solicitação já aparece para a equipe CanecaFácil.');
      const result = await studio(client, { action: 'history' }) as { jobs?: HistoryItem[] };
      setHistory(result.jobs || []);
    } catch {
      setError('Não foi possível salvar essa arte. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  function newCreation() {
    setJob(null);
    setSelectedVersion(null);
    setSelectedReferenceId('');
    setCustomText('');
    setTextKind('name');
    setContact({ name: '', email: '', whatsapp: '' });
    setError('');
    setNotice('');
  }

  return (
    <main className="public-caneca">
      <header className="public-topbar">
        <a className="public-brand" href="#top" aria-label="CanecaFácil, início">
          <span className="public-brand-mark" aria-hidden="true">c</span>
          <span>Caneca<span>Fácil</span></span>
        </a>
        {job ? <button className="public-reset" type="button" onClick={newCreation} disabled={busy}>+ Nova criação</button> : <span className="public-trust">Personalizada por você</span>}
      </header>

      <section className="public-hero" id="top">
        <div>
          <p className="public-kicker">SUA IDEIA, SUA CANECA</p>
          <h1>Crie uma caneca<br /><em>com a sua história.</em></h1>
          <p>Escolha uma inspiração, escreva um nome ou frase e receba três artes originais para escolher.</p>
        </div>
        <div className="public-hero-art" aria-hidden="true"><span>☕</span><i>✦</i><b>✿</b></div>
      </section>

      {error ? <p className="public-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="public-message is-notice" role="status">{notice}</p> : null}

      {job ? (
        <section className="public-result" aria-labelledby="result-title">
          <div className="public-section-head">
            <div><p className="public-kicker">AS SUAS OPÇÕES</p><h2 id="result-title">Escolha a arte que mais gostou</h2></div>
            <button className="public-link" type="button" onClick={newCreation}>Começar outra</button>
          </div>
          {!ready(job) ? <div className="public-loading"><span className="public-spinner" />Criando três opções de arte…</div> : null}
          {job.status === 'failed' ? <p className="public-message is-error">A criação não terminou. Você pode começar outra ou abrir uma criação anterior.</p> : null}
          {options.length ? <div className="public-options">
            {options.map((item) => <button type="button" key={item.version}
              className={'public-option' + (selectedVersion === item.version ? ' is-selected' : '')}
              onClick={() => setSelectedVersion(item.version)} aria-pressed={selectedVersion === item.version}>
              <img src={item.url} alt={'Arte ' + (item.variantIndex || item.version)} />
              <span><strong>Opção {item.variantIndex || item.version}</strong><small>{selectedVersion === item.version ? 'Selecionada' : 'Ver esta opção'}</small></span>
            </button>)}
          </div> : null}

          {chosenArt ? <div className="public-selected-art">
            <div className="public-selected-copy"><span>ARTE SELECIONADA</span><h3>{textKind === 'name' ? 'Caneca com nome' : 'Caneca com frase'}</h3><p>“{customText || job.title}”</p></div>
            <a href={chosenArt.url} download={'canecafacil-arte-v' + chosenArt.version + '.webp'}>Baixar arte</a>
            <img src={chosenArt.url} alt="Arte horizontal escolhida para impressão" />
          </div> : null}

          {pairMockup ? <figure className="public-pair-preview">
            <img src={pairMockup.url} alt="Mockup quadrado com a alça à esquerda na vista superior e a alça à direita na vista inferior" />
            <figcaption>Vista superior: alça à esquerda · vista inferior: alça à direita</figcaption>
          </figure> : null}

          {saved ? <div className="public-saved-card"><span aria-hidden="true">✓</span><div><strong>Arte salva</strong><p>A equipe CanecaFácil recebeu sua escolha e seus dados para dar andamento à solicitação.</p></div></div> : null}

          {!saved && chosenArt ? <section className="public-next-step">
            <div className="public-section-head compact"><div><p className="public-kicker">VEJA NA CANECA</p><h2>Gerar mockup das duas posições</h2></div></div>
            <p className="public-explain">Informe seus dados para montar uma prévia quadrada com a vista da alça para a esquerda em cima e para a direita embaixo.</p>
            <div className="public-contact-grid">
              <label>Seu nome<input autoComplete="name" value={contact.name} onChange={(event) => setContact({ ...contact, name: event.target.value })} placeholder="Como podemos chamar você?" /></label>
              <label>E-mail<input type="email" autoComplete="email" value={contact.email} onChange={(event) => setContact({ ...contact, email: event.target.value })} placeholder="voce@email.com" /></label>
              <label>WhatsApp com DDD<input type="tel" autoComplete="tel" value={contact.whatsapp} onChange={(event) => setContact({ ...contact, whatsapp: event.target.value })} placeholder="(65) 99999-9999" /></label>
            </div>
            <p className="public-privacy">Usaremos esses dados para identificar sua criação e retornar sobre a caneca.</p>
            {!pairMockup ? <button className="public-primary" type="button" disabled={busy || job.status !== 'needs_review'} onClick={() => void generateMockup()}>
              {busy ? 'Preparando sua prévia…' : 'Gerar mockup quadrado'}
            </button> : <button className="public-primary" type="button" disabled={busy} onClick={() => void saveDesign()}>
              {busy ? 'Salvando…' : 'Gostei, salvar esta arte'}
            </button>}
            {pairMockup ? <button className="public-secondary" type="button" disabled={busy} onClick={() => void generateMockup()}>Gerar mockup novamente</button> : null}
          </section> : null}
        </section>
      ) : (
        <form className="public-create" onSubmit={(event) => void generateArt(event)}>
          <section className="public-step">
            <div className="public-section-head"><div><p className="public-kicker">PASSO 1</p><h2>Escolha uma imagem de referência</h2><p>Ela inspira uma arte nova; não será copiada.</p></div></div>
            <div className="public-categories" aria-label="Filtrar referências">
              {categories.map((category) => <button type="button" key={category}
                className={selectedCategory === category ? 'is-active' : ''}
                onClick={() => setSelectedCategory(category)}>{category}</button>)}
            </div>
            <div className="public-reference-grid">
              {visibleReferences.map((item) => <button type="button" key={item.id}
                className={'public-reference' + (selectedReferenceId === item.id ? ' is-selected' : '')}
                onClick={() => setSelectedReferenceId(item.id)} aria-pressed={selectedReferenceId === item.id}>
                <span className="public-reference-art" style={{ background: 'linear-gradient(145deg,' + item.colors[0] + ',' + item.colors[1] + ')' }}>
                  {item.url ? <img src={item.url} alt="" /> : <><i>{item.symbol}</i><b aria-hidden="true">✦</b><small aria-hidden="true">✿</small></>}
                  {selectedReferenceId === item.id ? <span className="public-check" aria-hidden="true">✓</span> : null}
                </span>
                <strong>{item.title}</strong><small>{item.category}</small>
              </button>)}
            </div>
          </section>

          <section className="public-step public-text-step">
            <div className="public-section-head"><div><p className="public-kicker">PASSO 2</p><h2>O que vai escrito na caneca?</h2><p>A frase ou o nome ficará ao lado da ilustração.</p></div></div>
            <div className="public-choice-row" role="radiogroup" aria-label="Tipo de texto">
              <label className={textKind === 'name' ? 'is-active' : ''}><input type="radio" name="text-kind" checked={textKind === 'name'} onChange={() => setTextKind('name')} />Nome</label>
              <label className={textKind === 'phrase' ? 'is-active' : ''}><input type="radio" name="text-kind" checked={textKind === 'phrase'} onChange={() => setTextKind('phrase')} />Frase</label>
            </div>
            <label className="public-text-label"><span>{textKind === 'name' ? 'Escreva o nome' : 'Escreva a frase'}</span>
              <input maxLength={120} value={customText} onChange={(event) => setCustomText(event.target.value)} placeholder={textKind === 'name' ? 'Ex.: Marina' : 'Ex.: Que nunca nos falte fé'} />
              <small>O texto será reproduzido como você escreveu, com acentos e pontuação.</small>
            </label>
            <button className="public-primary public-generate" type="submit" disabled={busy || !selectedReferenceId || !customText.trim()}>
              {busy ? 'Criando suas três artes…' : 'Gerar 3 opções de arte'}
            </button>
            <p className="public-unlimited">Você pode criar quantas opções quiser.</p>
          </section>
        </form>
      )}

      {history.length > 1 ? <section className="public-history">
        <p className="public-kicker">SUAS CRIAÇÕES NESTE NAVEGADOR</p>
        <div>{history.slice(0, 6).map((item) => <button type="button" key={item.projectId}
          className={job?.projectId === item.projectId ? 'is-current' : ''}
          disabled={busy} onClick={() => void selectHistory(item.projectId)}>
          <span><strong>{item.title}</strong><small>{item.status === 'needs_review' ? 'Arte pronta' : item.status === 'failed' ? 'Não concluída' : 'Em andamento'}</small></span>
          <b aria-hidden="true">›</b>
        </button>)}</div>
      </section> : null}

      <footer className="public-footer"><span>CanecaFácil · Sua ideia vira presente.</span><a href="#admin">Área administrativa</a></footer>
    </main>
  );
}
