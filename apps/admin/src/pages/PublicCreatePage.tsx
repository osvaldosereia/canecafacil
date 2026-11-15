import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './PublicCreatePage.css';

type MugTheme = 'Pet' | 'Família' | 'Amigo';
type ArtVersion = {
  version: number;
  variantIndex?: number;
  styleStrategy?: string;
  url: string | null;
};
type Mockup = { version: number; side: 'pair' | 'left' | 'right'; url: string | null };
type Contact = { name: string; email: string; whatsapp: string };
type PublicRequest = {
  theme?: MugTheme | string;
  mugName?: string;
  text?: string;
  kind?: 'name' | 'phrase';
  name?: string;
};
type Creation = {
  projectId: string;
  title: string;
  status: string;
  customerContact?: Contact | null;
  customerSavedVersion?: number | null;
  orderStatus?: string | null;
  publicRequest?: PublicRequest | null;
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
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const themes: MugTheme[] = ['Pet', 'Família', 'Amigo'];
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

const ready = (job: Creation) => job.status === 'needs_review' || job.status === 'failed';
const digitsOnly = (value: string) => value.replace(/\D/g, '');

export function PublicCreatePage({ client }: { client: SupabaseClient }) {
  const [theme, setTheme] = useState<MugTheme | ''>('');
  const [mugName, setMugName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [job, setJob] = useState<Creation | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [contact, setContact] = useState<Contact>(() => ({ ...savedCustomerProfile(), whatsapp: '' }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      const profile = { name: contact.name.trim(), email: contact.email.trim() };
      if (profile.name || profile.email) localStorage.setItem(CUSTOMER_PROFILE_KEY, JSON.stringify(profile));
      else localStorage.removeItem(CUSTOMER_PROFILE_KEY);
    } catch { /* Private browsing can disable local persistence. */ }
  }, [contact.name, contact.email]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const selectedArt = job?.artVersions.find((item) => item.version === selectedVersion) ?? null;
  const selectedMockup = job?.mockups.find((item) => item.version === selectedVersion && item.side === 'pair') ?? null;
  const variants = job?.artVersions.filter((item) => item.variantIndex).sort((a, b) => (a.variantIndex || a.version) - (b.variantIndex || b.version)) ?? [];
  const orderSaved = Boolean(job?.customerSavedVersion && job.customerSavedVersion === selectedVersion);
  const savedMugName = job?.publicRequest?.mugName || job?.publicRequest?.name || '';
  const currentTheme = job?.publicRequest?.theme || '';

  function updateContact(field: 'name' | 'email' | 'whatsapp', value: string) {
    setContact((current) => ({ ...current, [field]: value }));
  }

  function restoreCreation(next: Creation) {
    setJob(next);
    setSelectedVersion(next.customerSavedVersion || null);
    if (next.customerContact) setContact({ ...next.customerContact, whatsapp: next.customerContact.whatsapp || '' });
    setTheme(themes.includes(next.publicRequest?.theme as MugTheme) ? next.publicRequest?.theme as MugTheme : '');
    setMugName(next.publicRequest?.mugName || next.publicRequest?.name || '');
    setImageFile(null);
    setBusy(!ready(next));
  }

  useEffect(() => {
    let active = true;
    void studio(client, { action: 'history' })
      .then(async (result: { jobs?: HistoryItem[] }) => {
        if (!active) return;
        const rows = result.jobs || [];
        setHistory(rows);
        if (rows[0]) {
          const latest = await studio(client, { action: 'load', jobId: rows[0].projectId }) as Creation;
          if (active) restoreCreation(latest);
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
          void studio(client, { action: 'history' })
            .then((value: { jobs?: HistoryItem[] }) => setHistory(value.jobs || []))
            .catch(() => undefined);
        } else {
          timer = window.setTimeout(advance, 1300);
        }
      } catch {
        if (active) {
          setError('A criação continua em andamento. Vamos tentar atualizar novamente.');
          timer = window.setTimeout(advance, 5000);
        }
      }
    }
    timer = window.setTimeout(advance, 500);
    return () => { active = false; window.clearTimeout(timer); };
  }, [client, job?.projectId, job?.status, busy]);

  async function refreshHistory() {
    try {
      const result = await studio(client, { action: 'history' }) as { jobs?: HistoryItem[] };
      setHistory(result.jobs || []);
    } catch { /* The creation itself remains saved on the server. */ }
  }

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

  function chooseImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    setError('');
    if (file && !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setImageFile(null);
      event.target.value = '';
      setError('Escolha uma imagem PNG, JPEG ou WebP.');
      return;
    }
    if (file && (file.size <= 0 || file.size > MAX_UPLOAD_BYTES)) {
      setImageFile(null);
      event.target.value = '';
      setError('A imagem precisa ter até 8 MB.');
      return;
    }
    setImageFile(file);
  }

  async function generateArt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const customerName = contact.name.trim();
    const customerEmail = contact.email.trim();
    const printName = mugName.trim();
    if (!themes.includes(theme as MugTheme)) {
      setError('Escolha o tema da caneca.');
      return;
    }
    if (!imageFile) {
      setError('Envie a imagem que será transformada em desenho.');
      return;
    }
    if (!printName) {
      setError('Digite o nome que será impresso na caneca.');
      return;
    }
    if (!customerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      setError('Informe seu nome e um e-mail válido antes de gerar.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    setJob(null);
    setSelectedVersion(null);
    try {
      const form = new FormData();
      form.set('action', 'start');
      form.set('customerName', customerName);
      form.set('customerEmail', customerEmail);
      form.set('title', 'Caneca · ' + printName.slice(0, 80));
      form.set('creationMode', 'reference');
      form.set('generationSide', 'both');
      form.set('publicRequest', JSON.stringify({ theme, mugName: printName, name: printName, text: printName, kind: 'name' }));
      form.set('artDescription', 'Arte autoral para caneca. Tema: ' + theme + '. Nome exato na metade esquerda: ' + printName + '. Ilustração inspirada na foto na metade direita.');
      form.set('mandatoryText', printName);
      form.set('reference', imageFile);
      const created = await studio(client, form) as Creation;
      setJob(created);
      setNotice('Criando três estilos de desenho e seus mockups. Esta tela atualiza sozinha.');
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : '';
      setError(code === 'openai_provider_secret_unavailable'
        ? 'A geração de arte está temporariamente indisponível. Tente novamente mais tarde.'
        : 'Não foi possível iniciar a criação. Confira os dados da imagem e tente novamente.');
      setBusy(false);
    }
  }

  async function saveDesign() {
    if (!job || !selectedArt || !selectedMockup || !selectedMockup.url || busy || orderSaved) return;
    const whatsapp = digitsOnly(contact.whatsapp);
    if (whatsapp.length < 10 || whatsapp.length > 15) {
      setError('Informe o WhatsApp com DDD para registrar a encomenda.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const updated = await studio(client, {
        action: 'save_design',
        jobId: job.projectId,
        version: selectedArt.version,
        customerWhatsapp: whatsapp,
      }) as Creation;
      setJob(updated);
      setContact((current) => ({ ...current, whatsapp }));
      setNotice('Sua escolha foi registrada para encomenda. O envio pelo WhatsApp será incluído em uma próxima etapa.');
      await refreshHistory();
    } catch {
      setError('Não foi possível registrar essa escolha. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  function newCreation() {
    setJob(null);
    setSelectedVersion(null);
    setTheme('');
    setMugName('');
    setImageFile(null);
    setContact((current) => ({ ...current, whatsapp: '' }));
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
          <h1>Uma lembrança<br /><em>desenhada para você.</em></h1>
          <p>Envie uma foto, escolha o tema e escreva o nome. Vamos transformar a imagem em uma ilustração original.</p>
        </div>
        <div className="public-hero-art" aria-hidden="true"><span>☕</span><i>✦</i><b>✿</b></div>
      </section>

      {error ? <p className="public-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="public-message is-notice" role="status">{notice}</p> : null}

      {!job ? (
        <form className="public-create-form" onSubmit={(event) => void generateArt(event)}>
          <div className="public-form-heading">
            <p className="public-kicker">PERSONALIZE SUA CANECA</p>
            <h2>Vamos criar seu desenho</h2>
            <p>O nome ficará à esquerda e a ilustração original à direita.</p>
          </div>
          <label className="public-field">
            <span>Tema</span>
            <select required value={theme} onChange={(event) => setTheme(event.target.value as MugTheme | '')}>
              <option value="">Selecione Pet, Família ou Amigo</option>
              {themes.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>

          <label className="public-upload">
            <span className="public-field-title">Imagem para transformar em desenho</span>
            <span className="public-upload-control">{imageFile ? 'Trocar imagem' : 'Escolher imagem'}</span>
            <span className="public-upload-hint">{imageFile ? imageFile.name : 'PNG, JPEG ou WebP · até 8 MB'}</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
          </label>
          {imagePreview ? <figure className="public-upload-preview"><img src={imagePreview} alt="Prévia da imagem enviada" /></figure> : null}

          <label className="public-field">
            <span>Nome na caneca <b>obrigatório</b></span>
            <input required maxLength={80} value={mugName} onChange={(event) => setMugName(event.target.value)} placeholder="Ex.: Mel, Marina ou Família Silva" />
            <small>O nome será escrito exatamente como você informou.</small>
          </label>

          <div className="public-contact-grid">
            <label className="public-field">
              <span>Seu nome</span>
              <input required autoComplete="name" maxLength={120} value={contact.name} onChange={(event) => updateContact('name', event.target.value)} placeholder="Como podemos chamar você?" />
            </label>
            <label className="public-field">
              <span>Seu e-mail</span>
              <input required type="email" autoComplete="email" maxLength={254} value={contact.email} onChange={(event) => updateContact('email', event.target.value)} placeholder="voce@email.com" />
            </label>
          </div>
          <p className="public-privacy">Seu nome e e-mail ficam salvos neste navegador para facilitar uma próxima criação.</p>
          <button className="public-primary" type="submit" disabled={busy}>
            {busy ? 'Preparando sua criação…' : 'Gerar 3 artes e mockups'}
          </button>
          <p className="public-generation-note">Cada opção terá uma arte horizontal e uma prévia quadrada com os dois lados da caneca.</p>
        </form>
      ) : (
        <section className="public-result" aria-labelledby="result-title">
          <div className="public-section-head">
            <div><p className="public-kicker">{ready(job) ? 'TRÊS ESTILOS PARA ESCOLHER' : 'CRIAÇÃO EM ANDAMENTO'}</p>
              <h2 id="result-title">{ready(job) ? 'Escolha o desenho que mais gostou' : 'Sua arte está sendo criada'}</h2></div>
            <button className="public-link" type="button" onClick={newCreation} disabled={busy}>Nova criação</button>
          </div>
          {!ready(job) ? <div className="public-loading"><span className="public-spinner" />Gerando três ilustrações diferentes e três mockups quadrados…</div> : null}
          {job.status === 'failed' ? <p className="public-message is-error">Uma etapa da geração falhou. Inicie uma nova criação para enviar a imagem novamente.</p> : null}
          {ready(job) && variants.length === 0 ? <p className="public-message is-error">A criação terminou sem imagens disponíveis. Tente gerar novamente.</p> : null}

          {variants.length ? <div className="public-options">
            {variants.map((item, index) => {
              const mockup = job.mockups.find((asset) => asset.version === item.version && asset.side === 'pair');
              return <article className={'public-option' + (selectedVersion === item.version ? ' is-selected' : '')} key={item.version}>
                <button className="public-option-select" type="button" onClick={() => setSelectedVersion(item.version)} aria-pressed={selectedVersion === item.version}>
                  <span className="public-option-title"><strong>Opção {item.variantIndex || index + 1}</strong><small>{item.styleStrategy || ['Aquarela delicada', 'Cartoon de traço limpo', 'Lápis de cor texturizado'][index]}</small></span>
                  <span className="public-variant-previews">
                    {item.url ? <img className="public-art-preview" src={item.url} alt={'Arte horizontal da opção ' + (item.variantIndex || index + 1)} />
                      : <span className="public-expired-art">Arte removida após 15 dias</span>}
                    {mockup?.url ? <img className="public-mockup-preview" src={mockup.url} alt={'Mockup quadrado da opção ' + (item.variantIndex || index + 1)} />
                      : <span className="public-mockup-pending">{ready(job) ? 'Mockup indisponível' : 'Preparando mockup…'}</span>}
                  </span>
                  <span className="public-option-action">{selectedVersion === item.version ? 'Selecionada' : 'Escolher esta opção'}</span>
                </button>
              </article>;
            })}
          </div> : null}

          {selectedArt ? <div className="public-selected-art">
            <div className="public-selected-copy">
              <span>OPÇÃO SELECIONADA · {currentTheme}</span>
              <h3>{savedMugName}</h3>
              {selectedArt.styleStrategy ? <p>Estilo: {selectedArt.styleStrategy}</p> : null}
            </div>
            {selectedArt.url ? <a href={selectedArt.url} download={'canecafacil-arte-v' + selectedArt.version + '.webp'}>Baixar arte para impressão</a>
              : <span className="public-expired-copy">Arte de impressão removida após 15 dias.</span>}
            {selectedArt.url ? <img className="public-selected-horizontal" src={selectedArt.url} alt="Arte horizontal para impressão com o nome à esquerda e a ilustração à direita" />
              : <div className="public-expired-art">O arquivo foi removido após 15 dias. A seleção permanece no histórico.</div>}
            {selectedMockup?.url ? <figure className="public-pair-preview">
              <img src={selectedMockup.url} alt="Mockup quadrado com as duas vistas da caneca, uma acima da outra" />
              <figcaption>Vista superior e inferior da mesma caneca</figcaption>
            </figure> : null}
          </div> : null}

          {ready(job) && selectedArt && selectedMockup?.url ? orderSaved ? (
            <div className="public-saved-card"><span aria-hidden="true">✓</span><div><strong>Escolha registrada</strong><p>O pedido ainda não foi enviado. A etapa de encomenda pelo WhatsApp será configurada depois.</p></div></div>
          ) : (
            <section className="public-order-step">
              <div className="public-section-head compact"><div><p className="public-kicker">QUER ENCOMENDAR?</p><h2>Confirme a opção escolhida</h2></div></div>
              <p className="public-explain">Informe seu telefone somente agora. Sua escolha ficará registrada para a equipe; o envio pelo WhatsApp será ativado em uma próxima etapa.</p>
              <label className="public-field">
                <span>WhatsApp com DDD</span>
                <input type="tel" autoComplete="tel" maxLength={24} value={contact.whatsapp} onChange={(event) => updateContact('whatsapp', event.target.value)} placeholder="(65) 99999-9999" />
              </label>
              <button className="public-primary" type="button" disabled={busy} onClick={() => void saveDesign()}>
                {busy ? 'Registrando sua escolha…' : 'Quero encomendar esta opção'}
              </button>
            </section>
          ) : null}
        </section>
      )}

      {history.length ? <section className="public-history" aria-label="Criações anteriores">
        <p className="public-kicker">SEU HISTÓRICO</p>
        <h2>Criações anteriores</h2>
        <div className="public-history-list">
          {history.map((item) => <button type="button" key={item.projectId} onClick={() => void selectHistory(item.projectId)} disabled={busy || item.projectId === job?.projectId}>
            <strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</small>
          </button>)}
        </div>
      </section> : null}

      <footer className="public-footer"><span>CanecaFácil · Sua ideia vira presente.</span><a href="#admin">Área administrativa</a></footer>
    </main>
  );
}
