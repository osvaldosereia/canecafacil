import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './StudioPage.css';

type Asset = { version: number; url: string };
type ArtVersion = Asset & {
  source: 'initial' | 'operator_edit' | 'quality_gate';
  parentVersion: number | null;
  instruction: string | null;
  createdAt: string | null;
};
type MockupAsset = Asset & { side: 'front' | 'back' };
type QualityReview = {
  approved: boolean;
  score: number;
  blocking_issues: string[];
  warnings: string[];
  concise_note: string;
};
type PrintState = {
  approvedVersion: number | null;
  quantity: number;
  completed: number;
  status: 'not_queued' | 'ready' | 'printed';
  approvedAt?: string | null;
  reprints: Array<{ version: number; reason: string; createdAt: string }>;
};
interface Job {
  projectId: string;
  title: string | null;
  status: string;
  processing?: boolean;
  art: Asset | null;
  artVersions: ArtVersion[];
  validation: QualityReview | null;
  mockups: MockupAsset[];
  printing: PrintState;
  printHistory: PrintState[];
  createdAt: string;
}
type HistoryItem = {
  projectId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  latestVersion: number | null;
};
interface StudioPageProps { client: SupabaseClient }

const STUDIO_SESSION_KEY = 'caneca-facil-studio-session-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let fallbackSessionId: string | null = null;

function getStudioSessionId(): string {
  try {
    const existing = window.localStorage.getItem(STUDIO_SESSION_KEY);
    if (existing && UUID_PATTERN.test(existing)) return existing;
    const sessionId = globalThis.crypto.randomUUID();
    window.localStorage.setItem(STUDIO_SESSION_KEY, sessionId);
    return sessionId;
  } catch {
    fallbackSessionId ??= globalThis.crypto.randomUUID();
    return fallbackSessionId;
  }
}

const statusText: Record<string, string> = {
  art_pending: 'Criando a arte para impressão…',
  review_pending: 'Conferindo texto e composição…',
  correction_pending: 'Aplicando o ajuste solicitado…',
  mockup_front_pending: 'Criando a primeira prévia…',
  mockup_back_pending: 'Criando a segunda prévia…',
  needs_review: 'Arte pronta para sua revisão',
  failed: 'Esta etapa não foi concluída',
};
const apiErrors: Record<string, string> = {
  studio_session_required: 'Atualize a página e entre novamente.',
  studio_auth_required: 'Sua sessão expirou. Entre novamente para continuar.',
  studio_admin_required: 'Sua conta não tem permissão para usar o Caneca 360.',
  studio_access_unavailable: 'Não foi possível confirmar sua permissão. Tente novamente em instantes.',
  studio_origin_not_allowed: 'Abra o Caneca 360 pelo site do Caneca Fácil.',
  studio_rate_limited: 'Você atingiu o limite de 5 ações de geração em 24 horas. Tente novamente mais tarde.',
  studio_rate_limit_unavailable: 'A proteção de uso está indisponível. Tente novamente em alguns minutos.',
  openai_provider_secret_unavailable: 'A conexão OpenAI existente não está disponível.',
  invalid_studio_input: 'Confira os campos e tente novamente.',
  studio_print_not_approved: 'Aprove uma versão antes de imprimir.',
  studio_print_quantity_complete: 'A quantidade aprovada já foi impressa. Use “Reimprimir” e informe o motivo.',
  studio_job_conflict: 'O projeto mudou em outra ação. Atualize a tela e tente novamente.',
  studio_job_start_failed: 'Não foi possível iniciar a criação.',
  studio_job_lookup_failed: 'Não foi possível carregar o projeto.',
  studio_job_step_failed: 'Uma etapa da criação falhou. Confira o status e tente novamente.',
  studio_job_not_found: 'Este projeto não foi encontrado.',
};
const finished = (status: string) => status === 'needs_review' || status === 'failed';

async function callStudio(client: SupabaseClient, body: FormData | Record<string, unknown>): Promise<any> {
  const { data, error } = await client.functions.invoke('caneca-studio', {
    body,
    headers: { 'x-studio-session': getStudioSessionId() },
  });
  if (error) {
    let code = 'studio_job_start_failed';
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.json() as { error?: unknown };
        if (typeof payload.error === 'string') code = payload.error;
      } catch { /* The SDK may return a non-JSON gateway error. */ }
    }
    throw new Error(code);
  }
  return data;
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && apiErrors[cause.message]) return apiErrors[cause.message];
  return fallback;
}

function sourceText(version: ArtVersion): string {
  if (version.source === 'initial') return 'Criação inicial';
  if (version.source === 'quality_gate') return 'Ajuste automático de qualidade';
  return 'Ajuste solicitado';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function StudioPage({ client }: StudioPageProps) {
  const [mode, setMode] = useState<'from_scratch' | 'reference'>('from_scratch');
  const [reference, setReference] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [latestVersionSeen, setLatestVersionSeen] = useState<number | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const printImageRef = useRef<HTMLImageElement>(null);

  function acceptJob(next: Job | null, forceLatest = false) {
    setJob(next);
    const newest = next?.artVersions?.at(-1)?.version ?? null;
    if (forceLatest || (newest !== null && newest !== latestVersionSeen)) {
      setLatestVersionSeen(newest);
      setSelectedVersion(newest);
    }
    if (next?.printing?.quantity) setQuantity(String(next.printing.quantity));
  }

  async function refreshHistory() {
    const result = await callStudio(client, { action: 'history' }) as { jobs?: HistoryItem[] };
    setHistory(result.jobs || []);
  }

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const listing = await callStudio(client, { action: 'history' }) as { jobs?: HistoryItem[] };
        if (!active) return;
        const items = listing.jobs || [];
        setHistory(items);
        if (items[0]) {
          const latest = await callStudio(client, { action: 'load', jobId: items[0].projectId }) as Job;
          if (active) acceptJob(latest, true);
        }
      } catch (cause) {
        if (active) setError(errorMessage(cause, 'Não foi possível carregar os projetos salvos.'));
      }
    })();
    return () => { active = false; };
  }, [client]);

  useEffect(() => {
    const projectId = job?.projectId;
    if (!projectId || !job || finished(job.status)) return;
    let active = true;
    let timer: number | undefined;

    const advance = async () => {
      try {
        const next = await callStudio(client, { action: 'advance', jobId: projectId }) as Job;
        if (!active) return;
        acceptJob(next);
        setError(null);
        if (!finished(next.status)) timer = window.setTimeout(advance, next.processing ? 15000 : 1300);
        else void refreshHistory().catch(() => undefined);
      } catch (cause) {
        if (!active) return;
        setError(errorMessage(cause, 'Não foi possível atualizar a criação.'));
        timer = window.setTimeout(advance, 15000);
      }
    };

    timer = window.setTimeout(advance, 400);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [client, job?.projectId, job?.status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData(formElement);
      form.set('action', 'start');
      form.set('creationMode', mode);
      if (reference) form.set('reference', reference);
      const created = await callStudio(client, form) as Job;
      setLatestVersionSeen(null);
      acceptJob(created, true);
      setNotice('Criação iniciada. Primeiro será gerada uma arte pronta para impressão.');
      formElement.reset();
      setReference(null);
      setMode('from_scratch');
      void refreshHistory().catch(() => undefined);
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível iniciar a criação.'));
    } finally {
      setBusy(false);
    }
  }

  async function chooseJob(projectId: string) {
    setBusy(true);
    setError(null);
    try {
      const loaded = await callStudio(client, { action: 'load', jobId: projectId }) as Job;
      setLatestVersionSeen(null);
      acceptJob(loaded, true);
      setNotice(null);
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível abrir o projeto.'));
    } finally {
      setBusy(false);
    }
  }

  async function requestEdit() {
    if (!job || selectedVersion === null || editInstruction.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await callStudio(client, {
        action: 'edit', jobId: job.projectId, version: selectedVersion, instruction: editInstruction.trim(),
      }) as Job;
      acceptJob(updated);
      setEditInstruction('');
      setNotice('Ajuste solicitado. A versão anterior continuará disponível no histórico.');
      void refreshHistory().catch(() => undefined);
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível solicitar esse ajuste.'));
    } finally {
      setBusy(false);
    }
  }

  async function generateMockups() {
    if (!job || selectedVersion === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await callStudio(client, {
        action: 'mockups', jobId: job.projectId, version: selectedVersion,
      }) as Job;
      acceptJob(updated);
      setNotice('Pré-vias iniciadas. Esta opção gera duas imagens extras usando OpenAI.');
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível gerar as prévias.'));
    } finally {
      setBusy(false);
    }
  }

  async function approveForPrint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!job || selectedVersion === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await callStudio(client, {
        action: 'approve', jobId: job.projectId, version: selectedVersion, quantity: Number(quantity),
      }) as Job;
      acceptJob(updated);
      setNotice(`Versão ${selectedVersion} aprovada para ${quantity} impressão(ões).`);
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível aprovar para impressão.'));
    } finally {
      setBusy(false);
    }
  }

  async function printCopy(reprint: boolean) {
    if (!job) return;
    let reason = '';
    if (reprint) {
      const entered = window.prompt('Informe por que esta cópia precisa ser reimpressa:');
      if (entered === null) return;
      reason = entered.trim();
      if (reason.length < 3) {
        setError('Informe um motivo com pelo menos 3 caracteres para registrar a reimpressão.');
        return;
      }
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const refreshed = await callStudio(client, { action: 'load', jobId: job.projectId }) as Job;
      acceptJob(refreshed);
      const approvedVersion = refreshed.printing.approvedVersion;
      const approvedArt = refreshed.artVersions.find((item) => item.version === approvedVersion);
      if (!approvedArt || refreshed.printing.status === 'not_queued') {
        throw new Error('studio_print_not_approved');
      }
      if (!reprint && refreshed.printing.completed >= refreshed.printing.quantity) {
        throw new Error('studio_print_quantity_complete');
      }

      setPrintUrl(approvedArt.url);
      await new Promise<void>((resolve, reject) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
          const image = printImageRef.current;
          if (!image) return reject(new Error('studio_job_lookup_failed'));
          if (image.complete) return image.naturalWidth > 0 ? resolve() : reject(new Error('studio_job_lookup_failed'));
          image.onload = () => resolve();
          image.onerror = () => reject(new Error('studio_job_lookup_failed'));
          window.setTimeout(() => reject(new Error('studio_job_lookup_failed')), 10000);
        }));
      });
      window.print();
      if (window.confirm('A cópia chegou a sair impressa?')) {
        const updated = await callStudio(client, {
          action: 'record_print', jobId: job.projectId, reprint, reason,
        }) as Job;
        acceptJob(updated);
        setNotice(reprint ? 'Reimpressão registrada.' : 'Cópia registrada na fila de produção.');
      } else {
        setNotice('Impressão não registrada. A quantidade da fila continua igual.');
      }
      setPrintUrl(null);
    } catch (cause) {
      setPrintUrl(null);
      setError(errorMessage(cause, 'Não foi possível preparar a folha de impressão.'));
    } finally {
      setBusy(false);
    }
  }

  const chosenArt = job?.artVersions.find((version) => version.version === selectedVersion) ?? null;
  const queuedVersion = job?.printing.approvedVersion ?? null;
  const queuedArt = job?.artVersions.find((version) => version.version === queuedVersion) ?? null;
  const selectedMockups = job?.mockups.filter((asset) => asset.version === selectedVersion) ?? [];
  const selectedIsLatest = chosenArt?.version === job?.artVersions.at(-1)?.version;

  return (
    <div className="studio-page">
      <header className="studio-heading">
        <div>
          <p className="studio-eyebrow">CANECAS PERSONALIZADAS · ESTÚDIO PRIVADO</p>
          <h1>Caneca 360</h1>
          <p>Criação, edição e impressão em um fluxo só: gere, ajuste, aprove e prepare cada cópia.</p>
        </div>
        <span className="studio-private">Acesso administrativo</span>
      </header>

      {error ? <p className="studio-alert studio-global-message" role="alert">{error}</p> : null}
      {notice ? <p className="studio-success studio-global-message" role="status">{notice}</p> : null}

      <div className="studio-columns">
        <aside className="studio-sidebar">
          <form className="studio-form" onSubmit={(event) => void submit(event)}>
            <section className="studio-card">
              <div className="studio-card-title">
                <span className="studio-step">01</span>
                <div><h2>Nova criação</h2><p>Descreva a arte para impressão.</p></div>
              </div>

              <label className="studio-field">
                <span>Nome do projeto</span>
                <input name="title" maxLength={100} placeholder="Ex.: Presente da Marina" />
              </label>

              <div className="studio-field">
                <span>Como começar?</span>
                <div className="studio-mode">
                  <label><input type="radio" name="studioMode" checked={mode === 'from_scratch'} onChange={() => {
                    setMode('from_scratch'); setReference(null);
                  }} /> Do zero</label>
                  <label><input type="radio" name="studioMode" checked={mode === 'reference'} onChange={() => setMode('reference')} /> Com referência</label>
                </div>
              </div>

              {mode === 'reference' ? (
                <label className="studio-field">
                  <span>Imagem de referência</span>
                  <input type="file" accept="image/png,image/jpeg,image/webp" required
                    onChange={(event) => setReference(event.currentTarget.files?.[0] ?? null)} />
                  <small>PNG, JPEG ou WebP, até 8 MB. O arquivo fica privado.</small>
                </label>
              ) : null}

              <div className="studio-two">
                <label className="studio-field"><span>Ocasião</span><input name="occasion" maxLength={120} placeholder="Aniversário, agradecimento…" /></label>
                <label className="studio-field"><span>Para quem?</span><input name="recipient" maxLength={120} placeholder="Nome ou relação" /></label>
              </div>

              <label className="studio-field">
                <span>Tema principal</span>
                <textarea name="mainTheme" maxLength={500} required rows={3} placeholder="A ideia central e o que a arte deve transmitir." />
              </label>

              <div className="studio-two">
                <label className="studio-field"><span>Estilo visual</span><input name="desiredStyle" maxLength={200} placeholder="Minimalista, aquarela…" /></label>
                <label className="studio-field"><span>Cores</span><textarea name="colorPreferences" maxLength={500} rows={2} placeholder="Uma cor por linha" /></label>
              </div>

              <label className="studio-field"><span>Texto exato da arte</span>
                <textarea name="mandatoryText" rows={2} maxLength={1000} placeholder="Uma frase ou nome por linha" />
              </label>
              <div className="studio-two">
                <label className="studio-field"><span>Elementos obrigatórios</span><textarea name="mandatoryElements" rows={3} maxLength={800} placeholder="Um elemento por linha" /></label>
                <label className="studio-field"><span>O que evitar</span><textarea name="forbiddenElements" rows={3} maxLength={800} placeholder="Um item por linha" /></label>
              </div>
              <label className="studio-field"><span>Composição e margens</span>
                <textarea name="compositionNotes" rows={3} maxLength={1000} placeholder="Posicionamento, equilíbrio, margem ou detalhes" />
              </label>

              <button className="studio-submit" disabled={busy || Boolean(job && !finished(job.status))} type="submit">
                {busy ? 'Preparando…' : job && !finished(job.status) ? 'Criação em andamento…' : 'Gerar arte para impressão'}
              </button>
              <p className="studio-note">Gera uma arte primeiro. Mockups são opcionais e só usam OpenAI se você pedir.</p>
            </section>
          </form>

          <section className="studio-card studio-history-card">
            <div className="studio-card-title compact-title">
              <span className="studio-step muted">↺</span>
              <div><h2>Projetos recentes</h2><p>Reabra criações anteriores.</p></div>
            </div>
            {history.length ? <div className="studio-history-list">
              {history.map((item) => (
                <button type="button" key={item.projectId}
                  className={'studio-history-item' + (item.projectId === job?.projectId ? ' is-current' : '')}
                  disabled={busy || item.projectId === job?.projectId}
                  onClick={() => void chooseJob(item.projectId)}>
                  <span><strong>{item.title || 'Sem nome'}</strong><small>{item.latestVersion ? `Versão ${item.latestVersion}` : 'Sem arte'} · {formatDate(item.updatedAt)}</small></span>
                  <b aria-hidden="true">›</b>
                </button>
              ))}
            </div> : <p className="studio-history-empty">Os projetos que você criar aparecerão aqui.</p>}
          </section>
        </aside>

        <main className="studio-results" aria-live="polite">
          <section className="studio-card studio-result-card">
            <div className="studio-card-title">
              <span className="studio-step muted">02</span>
              <div><h2>Arte e versões</h2><p>{job?.title || 'Acompanhe a criação e faça ajustes.'}</p></div>
            </div>

            {!job ? <div className="studio-empty"><b aria-hidden="true">✳</b><p>Preencha o briefing para começar.</p></div> : <>
              <div className={'studio-status' + (job.status === 'failed' ? ' failed' : '')}>
                <i />{statusText[job.status] ?? 'Processamento em andamento…'}
              </div>

              {job.artVersions.length ? <>
                <div className="studio-version-strip" aria-label="Histórico de versões">
                  {job.artVersions.map((version) => (
                    <button type="button" key={version.version}
                      className={'studio-version-chip' + (version.version === selectedVersion ? ' is-selected' : '')}
                      onClick={() => setSelectedVersion(version.version)}>
                      <span>v{version.version}</span><small>{sourceText(version)}</small>
                    </button>
                  ))}
                </div>

                {chosenArt ? <figure className="studio-art">
                  <img src={chosenArt.url} alt={`Arte panorâmica para impressão, versão ${chosenArt.version}`} />
                  <figcaption>
                    <span>Arte aberta · versão {chosenArt.version} · 2400 × 960 px</span>
                    <a href={chosenArt.url} target="_blank" rel="noreferrer" download>Baixar arquivo</a>
                  </figcaption>
                </figure> : null}

                {chosenArt?.instruction ? <p className="studio-version-note">{sourceText(chosenArt)}: {chosenArt.instruction}</p> : null}

                {job.validation && selectedIsLatest ? (
                  <section className={'studio-quality' + (job.validation.approved ? ' is-approved' : '')} aria-label="Revisão de qualidade da arte">
                    <div className="studio-quality-heading">
                      <strong>Revisão visual automática · {job.validation.score}/100</strong>
                      <span>{job.validation.approved ? 'A revisão automática passou; aprove manualmente para imprimir.' : 'Confira a arte com atenção antes de aprovar.'}</span>
                    </div>
                    <p>{job.validation.concise_note}</p>
                    {job.validation.blocking_issues.length ? <ul>{job.validation.blocking_issues.map((item, index) => <li key={'issue-' + index}>{item}</li>)}</ul> : null}
                    {job.validation.warnings.length ? <ul className="studio-quality-warnings">{job.validation.warnings.map((item, index) => <li key={'warning-' + index}>{item}</li>)}</ul> : null}
                  </section>
                ) : null}

                {job.status === 'needs_review' ? <>
                  <section className="studio-action-card">
                    <div className="studio-section-heading"><div><h3>Ajustar esta versão</h3><p>Peça uma mudança em linguagem natural; a versão atual será preservada.</p></div></div>
                    <label className="studio-field">
                      <span>O que você quer mudar na versão {selectedVersion}?</span>
                      <textarea value={editInstruction} maxLength={800} rows={3} onChange={(event) => setEditInstruction(event.currentTarget.value)}
                        placeholder="Ex.: deixe o fundo mais claro e mantenha o nome e a posição do desenho." />
                    </label>
                    <button className="studio-secondary" type="button" disabled={busy || editInstruction.trim().length < 3}
                      onClick={() => void requestEdit()}>Criar nova versão com esse ajuste</button>
                  </section>

                  <section className="studio-action-card studio-optional-card">
                    <div className="studio-section-heading"><div><h3>Ver a arte na caneca</h3><p>Gera duas prévias de produto; não são usadas para imprimir.</p></div></div>
                    <button className="studio-quiet-button" type="button" disabled={busy}
                      onClick={() => void generateMockups()}>Gerar 2 mockups desta versão</button>
                    {selectedMockups.length ? <div className="studio-mockups">
                      {selectedMockups.map((asset) => <figure key={`${asset.version}-${asset.side}`}>
                        <img src={asset.url} alt={`Mockup de caneca, ${asset.side === 'front' ? 'vista frontal' : 'vista oposta'}`} />
                        <figcaption><span>{asset.side === 'front' ? 'Vista frontal' : 'Vista oposta'}</span>
                          <a href={asset.url} target="_blank" rel="noreferrer" download>Abrir</a></figcaption>
                      </figure>)}
                    </div> : null}
                  </section>

                  <form className="studio-action-card studio-approval" onSubmit={(event) => void approveForPrint(event)}>
                    <div className="studio-section-heading"><div><h3>Aprovar para impressão</h3><p>A aprovação fica vinculada à versão selecionada.</p></div></div>
                    <div className="studio-approval-row">
                      <label className="studio-field"><span>Quantidade</span><input type="number" min="1" max="500" value={quantity} onChange={(event) => setQuantity(event.currentTarget.value)} required /></label>
                      <button className="studio-submit" type="submit" disabled={busy}>Aprovar versão {selectedVersion}</button>
                    </div>
                  </form>
                </> : null}

                {job.status === 'failed' ? <p className="studio-review">Esta criação parou antes de ficar pronta. Você pode iniciar outra usando o briefing ao lado.</p> : null}

                {queuedVersion !== null && job.printing ? <section className="studio-print-queue">
                  <div className="studio-print-queue-head">
                    <div><p className="studio-eyebrow">FILA INTERNA DE IMPRESSÃO</p><h3>Versão {queuedVersion} aprovada</h3></div>
                    <span className={job.printing.status === 'printed' ? 'queue-done' : 'queue-ready'}>{job.printing.status === 'printed' ? 'Quantidade concluída' : 'Pronta para produzir'}</span>
                  </div>
                  <div className="studio-queue-count"><strong>{job.printing.completed}</strong><span>de</span><strong>{job.printing.quantity}</strong><span>cópias impressas</span></div>
                  <div className="studio-print-actions">
                    <button className="studio-submit" type="button" disabled={busy || job.printing.completed >= job.printing.quantity}
                      onClick={() => void printCopy(false)}>{busy ? 'Preparando…' : 'Imprimir próxima cópia'}</button>
                    <button className="studio-quiet-button" type="button" disabled={busy || job.printing.completed < 1}
                      onClick={() => void printCopy(true)}>Reimprimir uma cópia</button>
                  </div>
                  <p className="studio-print-help">Folha Epson: 106 × 247 mm · arte 235 × 106 mm. Use escala de 100% e deixe o espelhamento do driver desligado; o arquivo já sai espelhado e girado uma vez.</p>
                  {queuedArt ? <p className="studio-print-help">Arquivo vinculado: Caneca 360 · v{queuedArt.version}.</p> : null}
                  {job.printing.reprints.length ? <details className="studio-reprints"><summary>Reimpressões registradas ({job.printing.reprints.length})</summary>
                    <ul>{job.printing.reprints.map((item, index) => <li key={item.createdAt + index}>{formatDate(item.createdAt)} · {item.reason}</li>)}</ul>
                  </details> : null}
                </section> : null}
                {job.printHistory.length ? <details className="studio-reprints studio-print-history">
                  <summary>Histórico de aprovações anteriores ({job.printHistory.length})</summary>
                  <ul>{job.printHistory.map((item, index) => <li key={`${item.approvedAt || item.approvedVersion}-${index}`}>
                    v{item.approvedVersion} · {item.completed}/{item.quantity} cópias · {item.status === 'printed' ? 'concluída' : 'fila substituída'}
                    {item.reprints.length ? ` · ${item.reprints.length} reimpressão(ões)` : ''}
                  </li>)}</ul>
                </details> : null}
              </> : <div className="studio-empty"><b aria-hidden="true">◌</b><p>A arte aparecerá aqui enquanto a automação trabalha.</p></div>}
            </>}
          </section>
        </main>
      </div>

      <div className="studio-print-sheet" aria-hidden="true">
        {printUrl ? <div className="studio-print-art"><img ref={printImageRef} src={printUrl} alt="Arte aprovada para sublimação" /></div> : null}
      </div>
    </div>
  );
}
