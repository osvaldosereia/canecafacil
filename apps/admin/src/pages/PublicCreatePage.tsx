import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createMockupSideReference } from '../lib/mug-artwork';
import './PublicCreatePage.css';

type ReferenceIdea = {
  id: string;
  title: string;
  category: string;
  url: string;
};
type ArtVersion = {
  version: number;
  variantIndex?: number;
  url: string | null;
  configuration?: { mandatoryText?: string[]; artDescription?: string };
};
type Mockup = { version: number; side: 'pair' | 'left' | 'right'; url: string | null };
type Contact = { name: string; email: string; whatsapp: string };
type PublicRequest = {
  text: string;
  kind: 'name' | 'phrase';
  name?: string;
  phrase?: string;
  autoPhrase?: boolean;
  generatedPhrase?: string;
  generatedTheme?: string;
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
const CUSTOMER_PROFILE_KEY = 'caneca-facil-customer-profile-v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let fallbackSessionId = '';

function savedCustomerProfile(): Pick<Contact, 'name' | 'email'> {
  try {
    const value = JSON.parse(localStorage.getItem(CUSTOMER_PROFILE_KEY) || '{}') as Record<string, unknown>;
    return {
      name: typeof value.name === 'string' ? value.name.slice(0, 120) : '',
      email: typeof value.email === 'string' ? value.email.slice(0, 254) : '',
    };
  } catch {
    return { name: '', email: '' };
  }
}

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

async function compressedReference(item: ReferenceIdea): Promise<File> {
  const response = await fetch(item.url, { mode: 'cors', credentials: 'omit' });
  if (!response.ok) throw new Error('catalog_reference_unavailable');
  const blob = await response.blob();
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
  const [catalogCategories, setCatalogCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [selectedReferenceId, setSelectedReferenceId] = useState('');
  const [cupName, setCupName] = useState('');
  const [cupPhrase, setCupPhrase] = useState('');
  const [autoPhrase, setAutoPhrase] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const referenceSectionRef = useRef<HTMLElement | null>(null);
  const [job, setJob] = useState<Creation | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [contact, setContact] = useState<Contact>(() => ({ ...savedCustomerProfile(), whatsapp: '' }));
  useEffect(() => {
    try {
      const profile = { name: contact.name.trim(), email: contact.email.trim() };
      if (profile.name || profile.email) localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
      else localStorage.removeItem(CUSTOMER_PROFILE_KEY);
    } catch { /* Private browsing can disable local persistence. */ }
  }, [contact.name, contact.email]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const allReferences = uploadedReferences;
  const categories = useMemo(() => ['Todas', ...catalogCategories], [catalogCategories]);
  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : 'Todas';
  const visibleReferences = activeCategory === 'Todas'
    ? allReferences
    : allReferences.filter((item) => item.category === activeCategory);
  const chosenArt = job?.artVersions.find((item) => item.version === selectedVersion) ?? null;
  const pairMockup = job?.mockups.find((item) => item.version === selectedVersion && item.side === 'pair') ?? null;
  const options = job?.artVersions.filter((item) => item.variantIndex) ?? [];
  const saved = Boolean(job?.customerSavedVersion && job.customerSavedVersion === selectedVersion);
  const request = job?.publicRequest;
  const resultName = request?.name ?? (request?.kind === 'name' ? request.text : '');
  const resultPhrase = request?.autoPhrase
    ? request.generatedPhrase || ''
    : request?.phrase ?? (request?.kind === 'phrase' ? request.text : '');
  const resultText = [resultName, resultPhrase].filter(Boolean).join(' · ');

  function restoreCreation(next: Creation) {
    const selected = next.customerSavedVersion || next.artVersions.find((item) => item.variantIndex)?.version || null;
    const art = next.artVersions.find((item) => item.version === selected);
    const request = next.publicRequest;
    const legacyText = request?.text || art?.configuration?.mandatoryText?.[0] || next.mandatoryText?.[0] || '';
    const referenceId = request?.referenceId || '';
    setJob(next);
    setSelectedVersion(selected);
    if (next.customerContact) {
      setContact({
        ...next.customerContact,
        whatsapp: next.customerContact.whatsapp || '',
      });
    }
    setCupName(request?.name ?? (request?.kind === 'name' ? legacyText : ''));
    setCupPhrase(request?.phrase ?? (request?.kind === 'phrase' && !request?.autoPhrase ? legacyText : request?.generatedPhrase || ''));
    setAutoPhrase(Boolean(request?.autoPhrase));
    setDrawerOpen(false);
    setSelectedReferenceId(referenceId);
    setSelectedCategory(request?.referenceCategory || 'Todas');
    setBusy(!ready(next));
  }

  useEffect(() => {
    if (!drawerOpen || job) return;
    const root = document.documentElement;
    const previousOverflowY = root.style.overflowY;
    root.style.overflowY = 'hidden';
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      root.style.overflowY = previousOverflowY;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [drawerOpen, job]);

  useEffect(() => {
    let active = true;
    void studio(client, { action: 'catalog_list' })
      .then((result: { items?: Array<{ id: string; title: string; category: string; url: string }>; categories?: string[] }) => {
        if (active) {
          const rawItems = result.items || [];
          const adminCategories = Array.isArray(result.categories)
            ? result.categories.filter((category): category is string => typeof category === 'string' && category.trim().length > 0)
            : [...new Set(rawItems.map((item) => item.category).filter((category) => typeof category === 'string' && category.trim().length > 0))];
          const allowedCategories = new Set(adminCategories);
          const loaded = rawItems.filter((item) => allowedCategories.has(item.category)).map((item) => ({
            id: item.id,
            title: item.title,
            category: item.category,
            url: item.url,
          }));
          setCatalogCategories([...new Set(adminCategories)]);
          setUploadedReferences(loaded);
        }
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
    const customerName = contact.name.trim();
    const customerEmail = contact.email.trim();
    if (!customerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      setError('Informe seu nome e um e-mail válido antes de gerar a arte. Pode ser só o primeiro nome.');
      return;
    }
    const selected = allReferences.find((item) => item.id === selectedReferenceId);
    if (!selected) {
      setError('Escolha uma imagem de referência para continuar.');
      return;
    }
    const name = cupName.trim();
    const phrase = cupPhrase.trim();
    const exactText = [name, autoPhrase ? '' : phrase].filter(Boolean);
    const titleText = name || (autoPhrase ? selected.title : phrase || selected.title);
    setBusy(true);
    setError('');
    setNotice('');
    setJob(null);
    setSelectedVersion(null);
    try {
      const reference = await compressedReference(selected);
      const form = new FormData();
      form.set('action', 'start');
      form.set('customerName', customerName);
      form.set('customerEmail', customerEmail);
      form.set('title', 'Caneca · ' + titleText.slice(0, 80));
      form.set('creationMode', 'reference');
      form.set('generationSide', 'both');
      form.set('publicRequest', JSON.stringify({
        text: exactText.join(' · '),
        kind: name && !phrase ? 'name' : 'phrase',
        name,
        phrase,
        autoPhrase,
        referenceId: selected.id,
        referenceTitle: selected.title,
        referenceCategory: selected.category,
      }));
      form.set('artDescription',
        'Crie um arquivo horizontal de impressão para caneca com 2400 × 960 px, dividido em duas metades iguais de 1200 × 960 px. A metade esquerda é destinada ao nome ou à frase exata, e a metade direita à ilustração original inspirada na referência. Em cada metade que tiver arte, centralize o conteúdo dentro da própria metade e mantenha seu limite em aproximadamente 80% da largura e 80% da altura disponíveis (caixa máxima de 960 × 768 px), deixando margens brancas equilibradas de cerca de 10% em todos os lados. Não cruze a divisão central, não encoste nem corte elementos nas bordas externas e não deixe a composição escapar da sua metade. Se não houver nome nem frase, mantenha a metade esquerda branca e limpa. Use fundo branco e acabamento suave nas laterais. A referência deve inspirar, nunca ser copiada; remova assinaturas, marcas d\'água e nomes de sites da referência.');
      form.set('mandatoryText', exactText.join('\n'));
      form.set('reference', reference);
      const created = await studio(client, form) as Creation;
      setJob(created);
      setDrawerOpen(false);
      if (created.customerContact) setContact({ ...created.customerContact, whatsapp: created.customerContact.whatsapp || '' });
      setNotice('Criando sua arte horizontal. Esta tela atualiza sozinha.');
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      setError(code === 'studio_phrase_generation_failed'
        ? 'Não foi possível criar uma frase para esta imagem. Tente novamente ou desmarque a criação automática.'
        : code === 'openai_provider_secret_unavailable'
          ? 'A automação de arte está temporariamente indisponível. Tente novamente mais tarde.'
          : 'Não foi possível iniciar a criação. Confira a conexão e tente novamente.');
      setBusy(false);
    }
  }

  async function generateMockup() {
    if (!job || !chosenArt || !chosenArt.url || busy) return;
    const normalizedWhatsapp = contact.whatsapp.replace(/\D/g, '');
    if (!contact.name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) ||
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
    setSelectedCategory('Todas');
    setCupName('');
    setCupPhrase('');
    setAutoPhrase(false);
    setDrawerOpen(false);
    setContact((current) => ({ ...current, whatsapp: '' }));
    setError('');
    setNotice('');
  }

  function openGenerator() {
    if (!selectedReferenceId) {
      referenceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setError('');
    setDrawerOpen(true);
  }

  return (
    <main className={'public-caneca' + (!job ? ' has-generator-launcher' : '')}>
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
          <p>Escolha uma inspiração e, se quiser, informe um nome ou frase. Você também pode pedir uma sugestão criada a partir da imagem.</p>
        </div>
        <div className="public-hero-art" aria-hidden="true"><span>☕</span><i>✦</i><b>✿</b></div>
      </section>

      {error ? <p className="public-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="public-message is-notice" role="status">{notice}</p> : null}

      {job ? (
        <section className="public-result" aria-labelledby="result-title">
          <div className="public-section-head">
            <div><p className="public-kicker">{options.length > 1 ? 'AS SUAS OPÇÕES' : 'ARTE PARA IMPRESSÃO'}</p>
              <h2 id="result-title">{options.length > 1 ? 'Escolha a arte que mais gostou' : 'Sua arte horizontal'}</h2></div>
            <button className="public-link" type="button" onClick={newCreation}>Começar outra</button>
          </div>
          {!ready(job) ? <div className="public-loading"><span className="public-spinner" />Criando sua arte horizontal…</div> : null}
          {job.status === 'failed' ? <p className="public-message is-error">A criação não terminou. Você pode começar outra ou abrir uma criação anterior.</p> : null}
          {options.length > 1 ? <div className="public-options">
            {options.map((item) => <button type="button" key={item.version}
              className={'public-option' + (selectedVersion === item.version ? ' is-selected' : '')}
              onClick={() => setSelectedVersion(item.version)} aria-pressed={selectedVersion === item.version}>
              {item.url ? <img src={item.url} alt={'Arte ' + (item.variantIndex || item.version)} /> : <span className="public-expired-art">Arquivo de impressão expirado</span>}
              <span><strong>Opção {item.variantIndex || item.version}</strong><small>{selectedVersion === item.version ? 'Selecionada' : 'Ver esta opção'}</small></span>
            </button>)}
          </div> : null}

          {chosenArt ? <div className="public-selected-art">
            <div className="public-selected-copy"><span>ARTE SELECIONADA</span>
              <h3>{resultName && resultPhrase ? 'Caneca com nome e frase' : resultName ? 'Caneca com nome' : resultPhrase ? 'Caneca com frase' : 'Arte sem texto personalizado'}</h3>
              <p>{resultText ? '“' + resultText + '”' : 'A arte foi criada sem nome ou frase.'}</p>
              {request?.generatedTheme ? <small>Tema percebido na referência: {request.generatedTheme}</small> : null}
            </div>
            {chosenArt.url ? <a href={chosenArt.url} download={'canecafacil-arte-v' + chosenArt.version + '.webp'}>Baixar arte</a>
              : <span className="public-expired-copy">Arquivo de impressão removido após 15 dias.</span>}
            {chosenArt.url ? <img src={chosenArt.url} alt="Arte horizontal escolhida para impressão" />
              : <div className="public-expired-art">A prévia foi removida após 15 dias. Os dados da criação continuam no histórico.</div>}
          </div> : null}

          {pairMockup?.url ? <figure className="public-pair-preview">
            <img src={pairMockup.url} alt="Mockup quadrado com a alça à esquerda na vista superior e a alça à direita na vista inferior" />
            <figcaption>Vista superior: alça à esquerda · vista inferior: alça à direita</figcaption>
          </figure> : null}

          {saved ? <div className="public-saved-card"><span aria-hidden="true">✓</span><div><strong>Arte salva</strong><p>A equipe CanecaFácil recebeu sua escolha e seus dados para dar andamento à solicitação.</p></div></div> : null}

          {!saved && chosenArt?.url ? <section className="public-next-step">
            <div className="public-section-head compact"><div><p className="public-kicker">VEJA NA CANECA</p><h2>Gerar mockup das duas posições</h2></div></div>
            <p className="public-explain">Seu nome e e-mail já identificam esta criação. Informe o WhatsApp com DDD para gerar a prévia quadrada das duas posições.</p>
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
        <section className="public-create">
          <section className="public-step" id="public-reference-selector" ref={referenceSectionRef}>
            <div className="public-section-head"><div><p className="public-kicker">PASSO 1</p><h2>Escolha uma imagem de referência</h2><p>Ela inspira uma arte nova; não será copiada.</p></div></div>
            <div className="public-categories" aria-label="Filtrar referências">
              {categories.map((category) => <button type="button" key={category}
                className={activeCategory === category ? 'is-active' : ''}
                onClick={() => setSelectedCategory(category)}>{category}</button>)}
            </div>
            <div className="public-reference-grid">
              {visibleReferences.map((item) => <button type="button" key={item.id}
                className={'public-reference' + (selectedReferenceId === item.id ? ' is-selected' : '')}
                onClick={() => { setSelectedReferenceId(item.id); setError(''); }} aria-pressed={selectedReferenceId === item.id}>
                <span className="public-reference-art">
                  <img src={item.url} alt="" loading="lazy" />
                  {selectedReferenceId === item.id ? <span className="public-check" aria-hidden="true">✓</span> : null}
                </span>
                <strong>{item.title}</strong><small>{item.category}</small>
              </button>)}
            </div>
            {!visibleReferences.length ? <div className="public-catalog-empty">As imagens de inspiração serão adicionadas pela equipe CanecaFácil.</div> : null}
          </section>
        </section>
      )}

      {!job ? <button className="public-generator-launcher" type="button" onClick={openGenerator} aria-haspopup="dialog">
        <span>{selectedReferenceId ? 'Personalizar Caneca' : 'Selecione uma imagem de referência'}</span><b aria-hidden="true">{selectedReferenceId ? '→' : '↑'}</b>
      </button> : null}

      {!job && drawerOpen ? <div className="public-drawer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false); }}>
        <section className="public-generator-drawer" role="dialog" aria-modal="true" aria-labelledby="generator-title">
          <div className="public-drawer-heading">
            <div><p className="public-kicker">PASSO 2 · PERSONALIZAÇÃO</p><h2 id="generator-title">Personalizar Caneca</h2><p>Nome e frase são opcionais. A arte continua sendo criada sem texto se você preferir.</p></div>
            <button className="public-drawer-close" type="button" onClick={() => setDrawerOpen(false)} aria-label="Fechar personalização">×</button>
          </div>
          {allReferences.find((item) => item.id === selectedReferenceId) ? <div className="public-drawer-reference">
            <img src={allReferences.find((item) => item.id === selectedReferenceId)?.url} alt="" />
            <span><small>IMAGEM DE INSPIRAÇÃO</small><strong>{allReferences.find((item) => item.id === selectedReferenceId)?.title}</strong></span>
          </div> : null}
          <form className="public-generator-form" onSubmit={(event) => void generateArt(event)}>
            <div className="public-contact-grid">
              <label>Seu nome <small>(pode ser só o primeiro)</small>
                <input required minLength={1} maxLength={120} autoComplete="name" value={contact.name}
                  onChange={(event) => setContact({ ...contact, name: event.target.value })}
                  placeholder="Ex.: Marina" />
              </label>
              <label>Seu e-mail
                <input required type="email" autoComplete="email" maxLength={254} value={contact.email}
                  onChange={(event) => setContact({ ...contact, email: event.target.value })}
                  placeholder="voce@email.com" />
              </label>
            </div>
            <label className="public-text-label"><span>Nome na Caneca <small>(opcional)</small></span>
              <input maxLength={80} value={cupName} onChange={(event) => setCupName(event.target.value)} placeholder="Ex.: Marina" />
              <small>O nome será reproduzido exatamente como você escrever.</small>
            </label>
            <label className="public-text-label"><span>Frase <small>(opcional)</small></span>
              <textarea maxLength={120} value={cupPhrase} onChange={(event) => setCupPhrase(event.target.value)} disabled={autoPhrase} placeholder={autoPhrase ? 'A frase será criada a partir do tema da imagem.' : 'Escreva uma frase ou deixe em branco.'} />
              <small>{autoPhrase ? 'A frase digitada fica guardada e não será usada enquanto a criação automática estiver marcada.' : 'O texto será reproduzido com a grafia e pontuação informadas.'}</small>
            </label>
            <label className="public-phrase-toggle">
              <input type="checkbox" checked={autoPhrase} onChange={(event) => setAutoPhrase(event.target.checked)} />
              <span><strong>Criar uma frase automaticamente</strong><small>A IA identifica o tema e o clima da imagem antes de escrever uma frase original.</small></span>
            </label>
            <button className="public-primary public-generate" type="submit" disabled={busy || !selectedReferenceId}>
              {busy ? 'Criando sua arte…' : 'Gerar arte horizontal'}
            </button>
            <p className="public-unlimited">Seu nome e e-mail ficam salvos neste navegador para facilitar as próximas criações.</p>
          </form>
        </section>
      </div> : null}

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
