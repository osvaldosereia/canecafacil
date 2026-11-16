import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './PublicCreatePage.css';

type MugTheme = 'Pet' | 'Família' | 'Amigo';
type PublicArtModel = { id: string; name: string; description: string; direction: string; svg: string };
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
  phrase?: string;
  styleModelId?: string;
  styleModelName?: string;
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
const themeDetails: Record<MugTheme, { symbol: string; description: string }> = {
  Pet: { symbol: '🐾', description: 'Seu companheiro em desenho' },
  Família: { symbol: '⌂', description: 'Uma lembrança cheia de afeto' },
  Amigo: { symbol: '♡', description: 'Um presente com personalidade' },
};
const artModels: PublicArtModel[] = [
  {
    id: 'aquarela',
    name: 'Aquarela suave',
    description: 'Leve, delicada e afetiva',
    direction: 'soft transparent watercolor washes, gentle paper texture, delicate hand-drawn contours, subtle color blooms and warm organic accents',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520"><rect width="720" height="520" rx="32" fill="#fbf7ef"/><circle cx="197" cy="217" r="120" fill="#e9c5b7" opacity=".42"/><circle cx="474" cy="188" r="104" fill="#b8d2c4" opacity=".48"/><path d="M176 345c11-97 48-151 120-151s109 54 120 151c-56 48-184 48-240 0Z" fill="#d7b18d" opacity=".68"/><ellipse cx="296" cy="189" rx="72" ry="91" fill="#e9c5b7" opacity=".76"/><path d="M238 185c7-70 111-99 154-33-21-18-42-21-64-10-23-21-64-9-90 43Z" fill="#866957" opacity=".72"/><path d="M271 204c8 7 16 7 24 0m30 0c8 7 16 7 24 0m-45 35c13 11 27 11 40 0" fill="none" stroke="#745d50" stroke-width="5" stroke-linecap="round" opacity=".7"/><path d="M456 324c24-44 40-80 46-120m-40 93c-43-10-60-32-66-68m69 39c42-7 65-28 75-62m-98 78c-29 1-51 15-66 43m112-41c27 7 45 24 55 50" fill="none" stroke="#6e9272" stroke-width="7" stroke-linecap="round" opacity=".68"/><circle cx="408" cy="208" r="16" fill="#d68c7b" opacity=".68"/><circle cx="493" cy="161" r="12" fill="#d6b46a" opacity=".7"/><circle cx="557" cy="249" r="11" fill="#d68c7b" opacity=".62"/></svg>`,
  },
  {
    id: 'cartoon',
    name: 'Cartoon delicado',
    description: 'Contorno limpo e expressão marcante',
    direction: 'a polished original clean-line cartoon, confident rounded outlines, expressive simplified forms, tidy cel shading and a friendly modern character illustration',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520"><rect width="720" height="520" rx="32" fill="#f2f6f2"/><circle cx="355" cy="250" r="173" fill="#e2eddf"/><path d="M212 372c13-104 69-151 143-151s130 47 143 151c-77 56-209 56-286 0Z" fill="#e6b967" stroke="#384b3d" stroke-width="10" stroke-linejoin="round"/><path d="M267 222c-24-33-23-96 7-119 29 27 43 53 43 81m93 38c24-33 23-96-7-119-29 27-43 53-43 81" fill="#da8e77" stroke="#384b3d" stroke-width="10" stroke-linejoin="round"/><ellipse cx="355" cy="211" rx="108" ry="126" fill="#f3d4a8" stroke="#384b3d" stroke-width="10"/><path d="M267 182c11-81 82-117 150-92 23 8 39 23 49 46-31-12-57-8-77 9-38-13-79-1-122 37Z" fill="#705247" stroke="#384b3d" stroke-width="8" stroke-linejoin="round"/><circle cx="321" cy="219" r="9" fill="#35483d"/><circle cx="389" cy="219" r="9" fill="#35483d"/><path d="M337 261c11 13 25 13 36 0" fill="none" stroke="#35483d" stroke-width="8" stroke-linecap="round"/><circle cx="292" cy="251" r="16" fill="#e79784" opacity=".8"/><circle cx="418" cy="251" r="16" fill="#e79784" opacity=".8"/><path d="M185 125l18 23 29-3-18 22 7 29-26-15-26 15 7-29-18-22 29 3z" fill="#e7bb53"/></svg>`,
  },
  {
    id: 'lapis-colorido',
    name: 'Lápis de cor',
    description: 'Textura artesanal e traços aparentes',
    direction: 'layered colored-pencil strokes, visible hand-drawn hatching, tactile paper grain, softly imperfect contours and a refined colored-pencil portrait finish',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520"><rect width="720" height="520" rx="32" fill="#fbf5e8"/><path d="M173 380c13-107 62-162 135-162s122 55 135 162c-59 42-211 42-270 0Z" fill="#a8bd9b" opacity=".68" stroke="#667c63" stroke-width="6" stroke-dasharray="3 8"/><ellipse cx="308" cy="203" rx="91" ry="112" fill="#e2b997" stroke="#916b55" stroke-width="6" stroke-dasharray="2 7"/><path d="M224 201c7-80 97-131 169-71-37-13-69-5-91 17-28-9-52 10-78 54Z" fill="#806452" stroke="#665448" stroke-width="7" stroke-dasharray="4 6"/><path d="M268 211l18 4m48-4 18-4m-72 44c17 13 34 13 51 0" fill="none" stroke="#705747" stroke-width="6" stroke-linecap="round" stroke-dasharray="2 5"/><path d="M440 362c37-43 66-92 76-151m-61 111c-45-4-72-29-86-66m101 31c45-1 74-22 94-55m-103 86c-27 5-51 22-67 52m121-59c30 8 51 29 61 60" fill="none" stroke="#68865d" stroke-width="7" stroke-linecap="round" stroke-dasharray="3 7"/><path d="M464 207l-22-15m52-6 19-22m32 71 25-5m-126 87-25 17m130-9 25 18" fill="none" stroke="#cb9560" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 8"/><circle cx="470" cy="177" r="13" fill="#d77e72"/><circle cx="540" cy="276" r="11" fill="#d8b45e"/></svg>`,
  },
  {
    id: 'guache',
    name: 'Guache contemporânea',
    description: 'Cores foscas e formas elegantes',
    direction: 'contemporary gouache painting with opaque matte pigments, clean layered shapes, restrained palette, soft edges and a polished editorial illustration',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520"><rect width="720" height="520" rx="32" fill="#f7f2e9"/><path d="M155 390c17-115 83-174 182-174s165 59 182 174c-96 54-268 54-364 0Z" fill="#789883"/><path d="M259 222c0-75 35-126 94-126s94 51 94 126-35 128-94 128-94-53-94-128Z" fill="#d8a685"/><path d="M252 215c5-93 53-143 121-143 52 0 88 31 101 84-31-15-63-13-92 3-33-18-76 1-130 56Z" fill="#5e514a"/><path d="M294 234c8 6 15 6 23 0m68 0c8 6 15 6 23 0m-70 38c15 11 30 11 45 0" fill="none" stroke="#52483f" stroke-width="8" stroke-linecap="round"/><path d="M477 336c32-54 50-102 51-151m-46 117c-38-5-63-28-72-66m111 30c38-6 63-24 75-54m-111 91c-28 5-47 20-58 45m127-39c26 9 41 27 49 51" fill="none" stroke="#6c8a65" stroke-width="13" stroke-linecap="round"/><circle cx="470" cy="186" r="17" fill="#d58b72"/><circle cx="557" cy="269" r="16" fill="#d9b45d"/><path d="M186 130l29 24 34-7-18 31 10 34-33-18-31 17 8-34-20-27 35 5z" fill="#d7a968"/></svg>`,
  },
];
const artModelPreview = (model: PublicArtModel) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(model.svg);
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

async function compressedArtModel(model: PublicArtModel): Promise<File> {
  const source = new Blob([model.svg], { type: 'image/svg+xml' });
  const image = await createImageBitmap(source);
  const canvas = document.createElement('canvas');
  const factor = Math.min(1, 900 / image.width, 900 / image.height);
  canvas.width = Math.max(1, Math.round(image.width * factor));
  canvas.height = Math.max(1, Math.round(image.height * factor));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('style_model_compression_failed');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const compressed = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
  if (!compressed || compressed.size > 100_000) throw new Error('style_model_compression_failed');
  return new File([compressed], model.id + '.webp', { type: 'image/webp' });
}

const ready = (job: Creation) => job.status === 'needs_review' || job.status === 'failed';
const digitsOnly = (value: string) => value.replace(/\D/g, '');

export function PublicCreatePage({ client }: { client: SupabaseClient }) {
  const [theme, setTheme] = useState<MugTheme | ''>('');
  const [mugName, setMugName] = useState('');
  const [mugPhrase, setMugPhrase] = useState('');
  const [styleModelId, setStyleModelId] = useState('');
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
  const savedMugName = job?.publicRequest?.name || job?.publicRequest?.mugName || '';
  const savedMugPhrase = job?.publicRequest?.phrase || '';
  const currentTheme = job?.publicRequest?.theme || '';
  const currentStyleModel = job?.publicRequest?.styleModelName || '';

  function updateContact(field: 'name' | 'email' | 'whatsapp', value: string) {
    setContact((current) => ({ ...current, [field]: value }));
  }

  function restoreCreation(next: Creation) {
    setJob(next);
    setSelectedVersion(next.customerSavedVersion || null);
    if (next.customerContact) setContact({ ...next.customerContact, whatsapp: next.customerContact.whatsapp || '' });
    setTheme(themes.includes(next.publicRequest?.theme as MugTheme) ? next.publicRequest?.theme as MugTheme : '');
    setMugName(next.publicRequest?.name || next.publicRequest?.mugName || '');
    setMugPhrase(next.publicRequest?.phrase || '');
    setStyleModelId(artModels.some((item) => item.id === next.publicRequest?.styleModelId) ? next.publicRequest?.styleModelId || '' : '');
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
    const phrase = mugPhrase.trim();
    const selectedModel = artModels.find((item) => item.id === styleModelId);
    if (!themes.includes(theme as MugTheme)) {
      setError('Escolha o tema da caneca.');
      return;
    }
    if (!imageFile) {
      setError('Envie a imagem que será transformada em desenho.');
      return;
    }
    if (!selectedModel) {
      setError('Escolha um modelo de arte para orientar o estilo da ilustração.');
      return;
    }
    if (!printName && !phrase) {
      setError('Informe um nome, uma frase ou os dois para personalizar a caneca.');
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
      const modelReference = await compressedArtModel(selectedModel);
      const exactText = [printName, phrase].filter(Boolean);
      const titleText = printName || phrase;
      form.set('action', 'start');
      form.set('customerName', customerName);
      form.set('customerEmail', customerEmail);
      form.set('title', 'Caneca · ' + titleText.slice(0, 80));
      form.set('creationMode', 'reference');
      form.set('generationSide', 'both');
      form.set('publicRequest', JSON.stringify({
        theme,
        mugName: printName,
        name: printName,
        phrase,
        text: exactText.join(' · '),
        kind: printName ? 'name' : 'phrase',
        styleModelId: selectedModel.id,
        styleModelName: selectedModel.name,
      }));
      form.set('artDescription', 'Arte original para caneca. Tema informado: ' + theme + '. Foto pessoal do cliente como referência do assunto. Modelo visual escolhido: ' + selectedModel.name + '. Texto exato na metade esquerda: ' + exactText.join(' · ') + '. Ilustração baseada na foto do cliente na metade direita.');
      form.set('mandatoryText', exactText.join('\n'));
      form.set('reference', imageFile);
      form.set('styleReference', modelReference);
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
    setMugPhrase('');
    setStyleModelId('');
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
        {!job ? (
          <>
            <nav className="public-main-nav" aria-label="Navegação principal">
              <a href="#how-it-works">Como funciona</a>
              <a href="#create-form">Personalizar</a>
            </nav>
            <a className="public-header-cta" href="#create-form">Criar minha caneca <span className="public-arrow" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M4 10h12M11 5l5 5-5 5" /></svg></span></a>
          </>
        ) : (
          <button className="public-reset" type="button" onClick={newCreation} disabled={busy}>+ Nova criação</button>
        )}
      </header>

      {error ? <p className="public-message is-error" role="alert">{error}</p> : null}
      {notice ? <p className="public-message is-notice" role="status">{notice}</p> : null}

      {!job ? (
        <>
          <section className="public-hero" id="top">
            <div className="public-hero-copy">
              <p className="public-kicker">SUA IDEIA, SUA CANECA</p>
              <h1>Sua foto vira<br /><em>uma lembrança única.</em></h1>
              <p>Envie a foto, escolha um modelo visual e personalize com nome, frase ou os dois. A IA cria uma ilustração original para a sua caneca.</p>
              <div className="public-hero-actions">
                <a className="public-primary public-hero-cta" href="#create-form">
                  Criar minha caneca <span className="public-arrow" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M4 10h12M11 5l5 5-5 5" /></svg></span>
                </a>
                <small>Comece com uma foto, um tema e um nome.</small>
              </div>
            </div>

            <figure className="public-hero-showcase">
              <figcaption className="public-preview-caption">
                <span>PRÉVIA ILUSTRATIVA</span>
                <small>Exemplo de personalização</small>
              </figcaption>
              <svg className="public-mug-illustration" viewBox="0 0 480 300" aria-hidden="true" focusable="false">
                <defs>
                  <linearGradient id="mug-body" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#fff" />
                    <stop offset="58%" stopColor="#f9f8f2" />
                    <stop offset="100%" stopColor="#e8ebe3" />
                  </linearGradient>
                  <linearGradient id="mug-handle" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#e9e8df" />
                    <stop offset="55%" stopColor="#fff" />
                    <stop offset="100%" stopColor="#d7dbd1" />
                  </linearGradient>
                </defs>
                <ellipse cx="218" cy="252" rx="155" ry="17" fill="#34483a" opacity=".1" />
                <path d="M326 101h34c49 0 49 105 0 105h-34" fill="none" stroke="#d7d9d0" strokeWidth="35" />
                <path d="M327 101h32c36 0 36 105 0 105h-32" fill="none" stroke="url(#mug-handle)" strokeWidth="23" />
                <path d="M84 66c4 60 5 123 20 164 47 26 181 26 228 0 15-41 16-104 20-164z" fill="url(#mug-body)" stroke="#d9ddd3" strokeWidth="2" />
                <ellipse cx="218" cy="66" rx="134" ry="25" fill="#fff" stroke="#d9ddd3" strokeWidth="2" />
                <ellipse cx="218" cy="67" rx="117" ry="15" fill="#f2f1e9" opacity=".8" />
                <path d="M112 215c46 19 164 19 211 0" fill="none" stroke="#e2e5dc" strokeWidth="2" />
                <text x="145" y="157" fill="#4f7758" fontFamily="Georgia,serif" fontSize="31" fontStyle="italic">Luna</text>
                <path d="M246 167c-3-14 10-22 21-13 11-9 24-1 21 13-2 8-11 14-21 21-10-7-19-13-21-21z" fill="#d89984" />
                <circle cx="250" cy="137" r="5" fill="#d89984" />
                <circle cx="263" cy="131" r="5" fill="#d89984" />
                <circle cx="277" cy="132" r="5" fill="#d89984" />
                <circle cx="289" cy="140" r="5" fill="#d89984" />
                <path d="M130 178c10-8 19-8 29 0m-31 8c11-5 21-5 31 0" fill="none" stroke="#9dae8f" strokeWidth="2" strokeLinecap="round" />
                <path d="M304 176c6-8 12-10 20-10m-18 19c7-5 14-6 21-5" fill="none" stroke="#9dae8f" strokeWidth="2" strokeLinecap="round" />
                <circle cx="162" cy="191" r="3" fill="#c19a56" />
                <circle cx="300" cy="193" r="3" fill="#c19a56" />
              </svg>
              <div className="public-preview-sides">
                <span><b>ESQUERDA</b> nome personalizado</span>
                <span><b>DIREITA</b> desenho inspirado na foto</span>
              </div>
            </figure>
          </section>

          <section className="public-trust-strip" aria-label="O que você recebe na criação">
            <span><b>01</b> Três estilos para comparar</span>
            <span><b>02</b> Arte horizontal para impressão</span>
            <span><b>03</b> Mockup com os dois lados</span>
          </section>

          <section className="public-how-it-works" id="how-it-works">
            <div className="public-section-intro">
              <p className="public-kicker">SIMPLES DE PERSONALIZAR</p>
              <h2>Uma ideia sua, em três passos.</h2>
              <p>Você participa das escolhas. A inteligência artificial cria propostas visuais a partir da foto e do tema que você enviar.</p>
            </div>
            <div className="public-step-grid">
              <article className="public-step-card">
                <span className="public-step-number">01</span>
                <h3>Escolha o tema</h3>
                <p>Escolha se a caneca é para um pet, alguém da família ou um amigo.</p>
              </article>
              <article className="public-step-card">
                <span className="public-step-number">02</span>
                <h3>Envie a foto e escolha o estilo</h3>
                <p>A foto define quem será ilustrado; o modelo escolhido orienta a linguagem visual.</p>
              </article>
              <article className="public-step-card">
                <span className="public-step-number">03</span>
                <h3>Compare as opções</h3>
                <p>Veja três propostas com nome e/ou frase na esquerda e ilustração à direita.</p>
              </article>
            </div>
          </section>

          <form id="create-form" className="public-create-form" onSubmit={(event) => void generateArt(event)}>
            <div className="public-form-heading">
              <p className="public-kicker">VAMOS CRIAR A SUA</p>
              <h2>Personalize sua caneca</h2>
              <p>A foto define o assunto, o modelo define o estilo e nome e frase ficam no lado esquerdo.</p>
            </div>

            <fieldset className="public-theme-fieldset">
              <legend><span className="public-form-step">1</span> Para quem é a caneca?</legend>
              <div className="public-theme-options">
                {themes.map((item) => (
                  <label className={'public-theme-option' + (theme === item ? ' is-selected' : '')} key={item}>
                    <input type="radio" name="theme" value={item} required checked={theme === item} onChange={() => setTheme(item)} />
                    <span className="public-theme-symbol" aria-hidden="true">{themeDetails[item].symbol}</span>
                    <span className="public-theme-copy"><strong>{item}</strong><small>{themeDetails[item].description}</small></span>
                    <span className="public-theme-check" aria-hidden="true">✓</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="public-upload">
              <span className="public-field-title"><span className="public-form-step">2</span> Envie a foto do pet, familiar, amigo ou de você</span>
              <span className="public-upload-control">{imageFile ? 'Trocar foto' : 'Escolher foto'}</span>
              <span className="public-upload-hint">{imageFile ? imageFile.name : 'PNG, JPEG ou WebP · até 8 MB'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseImage} />
            </label>
            {imagePreview ? <figure className="public-upload-preview"><img src={imagePreview} alt="Prévia da foto escolhida" /><figcaption>A sua foto define o assunto da ilustração; a IA vai transformá-la em um desenho original.</figcaption></figure> : null}

            <section className="public-style-section" aria-labelledby="art-model-title">
              <div className="public-style-heading">
                <span className="public-field-title"><span className="public-form-step">3</span> Escolha um modelo de arte</span>
                <p id="art-model-title">Este exemplo orienta o traço e o acabamento. A IA usa a sua foto como assunto e cria uma arte nova.</p>
              </div>
              <div className="public-style-grid">
                {artModels.map((model) => (
                  <label className={'public-style-option' + (styleModelId === model.id ? ' is-selected' : '')} key={model.id}>
                    <input type="radio" name="styleModel" value={model.id} required checked={styleModelId === model.id}
                      onChange={() => setStyleModelId(model.id)} />
                    <img src={artModelPreview(model)} alt="" loading="lazy" />
                    <span><strong>{model.name}</strong><small>{model.description}</small></span>
                    <b className="public-style-check" aria-hidden="true">✓</b>
                  </label>
                ))}
              </div>
            </section>

            <div className="public-personal-text">
              <div className="public-personal-text-heading">
                <span className="public-field-title"><span className="public-form-step">4</span> O que vai escrito na caneca?</span>
                <p>Preencha o nome, a frase ou os dois. Pelo menos um deles é necessário.</p>
              </div>
              <label className="public-field">
                <span>Nome na caneca <b>opcional</b></span>
                <input maxLength={80} value={mugName} onChange={(event) => setMugName(event.target.value)} placeholder="Ex.: Luna, Thor ou família Oliveira" />
                <small>Se preencher, o nome será reproduzido exatamente como você escreveu.</small>
              </label>
              <label className="public-field">
                <span>Frase <b>opcional</b></span>
                <textarea maxLength={120} value={mugPhrase} onChange={(event) => setMugPhrase(event.target.value)} placeholder="Ex.: Meu melhor amigo de quatro patas" />
                <small>A frase também ficará no lado esquerdo, abaixo do nome quando os dois forem informados.</small>
              </label>
            </div>
            <div className="public-personal-data">
              <div className="public-personal-data-copy">
                <p className="public-kicker">PARA IDENTIFICAR SUAS CRIAÇÕES</p>
                <h3>Como podemos encontrar suas artes?</h3>
                <p>Usamos seu nome e e-mail para vincular cada criação ao seu cadastro.</p>
              </div>
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
            </div>
            <p className="public-privacy">Seu nome e e-mail ficam salvos neste navegador para facilitar outra criação e são enviados para vincular as artes ao seu cadastro.</p>
            <button className="public-primary public-generate-button" type="submit" disabled={busy}>
              {busy ? 'Preparando sua criação…' : 'Criar 3 opções de arte'}
              {!busy ? <span className="public-arrow" aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><path d="M4 10h12M11 5l5 5-5 5" /></svg></span> : null}
            </button>
            <p className="public-generation-note">Cada opção inclui uma arte horizontal para impressão e uma prévia quadrada com os dois lados da caneca.</p>
          </form>

          <section className="public-faq" aria-labelledby="faq-title">
            <div className="public-section-intro">
              <p className="public-kicker">ANTES DE COMEÇAR</p>
              <h2 id="faq-title">Dúvidas rápidas</h2>
            </div>
            <details>
              <summary>A foto será copiada para a caneca?</summary>
              <p>Não. Ela serve como referência para criar uma ilustração nova, adaptada ao tema escolhido.</p>
            </details>
            <details>
              <summary>Vou ver a caneca antes de decidir?</summary>
              <p>Sim. Cada opção mostra a arte horizontal e um mockup quadrado com os dois lados da caneca.</p>
            </details>
            <details>
              <summary>Ao escolher uma arte, o pedido já é confirmado?</summary>
              <p>A escolha fica registrada para o atendimento. O pagamento e o cálculo do envio serão apresentados quando a finalização da encomenda estiver disponível.</p>
            </details>
          </section>
        </>
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
              <span>OPÇÃO SELECIONADA · {currentTheme}{currentStyleModel ? ' · ' + currentStyleModel : ''}</span>
              <h3>{savedMugName || savedMugPhrase || 'Arte personalizada'}</h3>
              {savedMugName ? <p>Nome: “{savedMugName}”</p> : null}
              {savedMugPhrase ? <p>Frase: “{savedMugPhrase}”</p> : null}
              {selectedArt.styleStrategy ? <p>Estilo desta variação: {selectedArt.styleStrategy}</p> : null}
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
            <div className="public-saved-card"><span aria-hidden="true">✓</span><div><strong>Escolha guardada</strong><p>Sua opção ficou registrada no atendimento. O pagamento e o cálculo do envio serão apresentados quando a finalização da encomenda estiver disponível.</p></div></div>
          ) : (
            <section className="public-order-step">
              <div className="public-section-head compact"><div><p className="public-kicker">PRÓXIMO PASSO</p><h2>Registre sua escolha</h2></div></div>
              <p className="public-explain">Informe seu WhatsApp para guardar esta opção no atendimento. Este registro não confirma o pagamento nem o envio da caneca.</p>
              <label className="public-field">
                <span>WhatsApp com DDD</span>
                <input type="tel" autoComplete="tel" maxLength={24} value={contact.whatsapp} onChange={(event) => updateContact('whatsapp', event.target.value)} placeholder="(65) 99999-9999" />
              </label>
              <button className="public-primary" type="button" disabled={busy} onClick={() => void saveDesign()}>
                {busy ? 'Registrando sua escolha…' : 'Registrar minha escolha'}
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