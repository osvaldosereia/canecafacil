import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './StudioPage.css';

interface Asset { version: number; url: string }
interface QualityReview {
  approved: boolean;
  score: number;
  blocking_issues: string[];
  warnings: string[];
  concise_note: string;
}
interface Job {
  projectId: string;
  title: string | null;
  status: string;
  processing?: boolean;
  art: Asset | null;
  validation: QualityReview | null;
  mockups: Asset[];
}
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
  queued: 'Aguardando geração…',
  art_pending: 'Criando a arte panorâmica…',
  review_pending: 'Conferindo a arte com o Quality Gate…',
  correction_pending: 'Ajustando a arte após a conferência…',
  mockup_front_pending: 'Criando o primeiro mockup…',
  mockup_back_pending: 'Criando o segundo mockup…',
  needs_review: 'Pronto para revisão',
  failed: 'A geração não foi concluída',
};
const apiErrors: Record<string, string> = {
  studio_session_required: 'Atualize a página para iniciar uma nova sessão do Estúdio.',
  studio_origin_not_allowed: 'Acesse o Estúdio pelo site oficial do Caneca Fácil.',
  studio_rate_limited: 'Esta rede atingiu o limite de 5 criações em 24 horas. Tente novamente mais tarde.',
  studio_rate_limit_unavailable: 'A proteção de uso está indisponível. Tente novamente em alguns minutos.',
  openai_provider_secret_unavailable: 'A conexão OpenAI do Supabase não está disponível.',
  invalid_studio_input: 'Confira os campos e a imagem de referência.',
  studio_job_start_failed: 'Não foi possível iniciar o trabalho de criação.',
  studio_job_lookup_failed: 'Não foi possível atualizar o trabalho.',
  studio_job_step_failed: 'Uma etapa da geração falhou. O trabalho foi marcado para revisão.',
  studio_job_not_found: 'O trabalho não foi encontrado.',
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
      } catch {}
    }
    throw new Error(code);
  }
  return data;
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && apiErrors[cause.message]) return apiErrors[cause.message];
  return fallback;
}

export function StudioPage({ client }: StudioPageProps) {
  const [mode, setMode] = useState<'from_scratch' | 'reference'>('from_scratch');
  const [reference, setReference] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void callStudio(client, { action: 'latest' })
      .then((result: { job?: Job | null }) => {
        if (active && result.job) setJob(result.job);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause, 'Não foi possível verificar o último trabalho.'));
      });
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
        setJob(next);
        setError(null);
        if (!finished(next.status)) {
          timer = window.setTimeout(advance, next.processing ? 15000 : 1600);
        }
      } catch (cause) {
        if (!active) return;
        setError(errorMessage(cause, 'Não foi possível atualizar o trabalho.'));
        timer = window.setTimeout(advance, 15000);
      }
    };

    timer = window.setTimeout(advance, 500);
    return () => {
      active = false;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [client, job?.projectId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError(null);
    setNotice(null);
    setJob(null);
    try {
      const form = new FormData(formElement);
      form.set('action', 'start');
      form.set('creationMode', mode);
      if (reference) form.set('reference', reference);
      const created = await callStudio(client, form) as Job;
      setJob(created);
      setNotice('Criação iniciada. O Estúdio atualizará cada etapa automaticamente.');
      formElement.reset();
      setReference(null);
      setMode('from_scratch');
    } catch (cause) {
      setError(errorMessage(cause, 'Não foi possível iniciar a criação.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-page">
      <header className="studio-heading">
        <div>
          <p className="studio-eyebrow">CRIAÇÃO ASSISTIDA</p>
          <h1>Estúdio de Canecas</h1>
          <p>Descreva a ideia. A automação prepara a arte, executa o Quality Gate visual e cria dois mockups privados.</p>
        </div>
        <span className="studio-private">Acesso direto</span>
      </header>

      <div className="studio-columns">
        <form className="studio-form" onSubmit={(event) => void submit(event)}>
          <section className="studio-card">
            <div className="studio-card-title">
              <span className="studio-step">01</span>
              <div><h2>Briefing da criação</h2><p>Defina o tema e a direção visual.</p></div>
            </div>

            <label className="studio-field">
              <span>Nome do projeto</span>
              <input name="title" maxLength={100} placeholder="Opcional · Ex.: Presente da Marina" />
            </label>

            <div className="studio-field">
              <span>Como vamos começar?</span>
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
                <small>PNG, JPEG ou WebP, até 8 MB. Arquivo privado.</small>
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

            <label className="studio-field"><span>Texto que deve aparecer</span>
              <textarea name="mandatoryText" rows={2} maxLength={1000} placeholder="Uma frase ou nome por linha" />
            </label>
            <div className="studio-two">
              <label className="studio-field"><span>Elementos obrigatórios</span><textarea name="mandatoryElements" rows={3} maxLength={800} placeholder="Um elemento por linha" /></label>
              <label className="studio-field"><span>O que evitar</span><textarea name="forbiddenElements" rows={3} maxLength={800} placeholder="Um item por linha" /></label>
            </div>
            <label className="studio-field"><span>Observações de composição</span>
              <textarea name="compositionNotes" rows={3} maxLength={1000} placeholder="Posicionamento, equilíbrio, margem ou detalhes" />
            </label>

            {error ? <p className="studio-alert" role="alert">{error}</p> : null}
            {notice ? <p className="studio-success" role="status">{notice}</p> : null}
            <button className="studio-submit" disabled={busy || Boolean(job && !finished(job.status))} type="submit">
              {busy ? 'Preparando…' : job && !finished(job.status) ? 'Geração em andamento…' : 'Gerar arte e mockups'}
            </button>
            <p className="studio-note">Confirme o gabarito, a composição e o texto antes de produzir.</p>
          </section>
        </form>

        <section className="studio-results" aria-live="polite">
          <div className="studio-card studio-result-card">
            <div className="studio-card-title">
              <span className="studio-step muted">02</span>
              <div><h2>Resultado</h2><p>{job?.title ?? 'A arte e as prévias aparecem aqui.'}</p></div>
            </div>
            {job ? <>
              <div className={'studio-status' + (job.status === 'failed' ? ' failed' : '')}>
                <i />{statusText[job.status] ?? 'Processamento em andamento…'}
              </div>
              {error ? <p className="studio-alert" role="alert">{error}</p> : null}
              {job.art ? <figure className="studio-art">
                <img src={job.art.url} alt="Arte panorâmica gerada para a caneca" />
                <figcaption><span>Arte panorâmica · versão {job.art.version}</span>
                  <a href={job.art.url} target="_blank" rel="noreferrer" download>Abrir arte</a></figcaption>
              </figure> : null}
              {job.validation ? (
                <section className={'studio-quality' + (job.validation.approved ? ' is-approved' : '')} aria-label="Revisão visual da arte">
                  <div className="studio-quality-heading">
                    <strong>Quality Gate visual · {job.validation.score}/100</strong>
                    <span>
                      {job.validation.approved
                        ? 'Verificação automática passou; revisão humana ainda pendente.'
                        : 'A arte precisa de conferência humana.'}
                    </span>
                  </div>
                  <p>{job.validation.concise_note}</p>
                  {job.validation.blocking_issues.length ? (
                    <ul>{job.validation.blocking_issues.map((item, index) => <li key={'issue-' + index}>{item}</li>)}</ul>
                  ) : null}
                  {job.validation.warnings.length ? (
                    <ul className="studio-quality-warnings">{job.validation.warnings.map((item, index) => <li key={'warning-' + index}>{item}</li>)}</ul>
                  ) : null}
                </section>
              ) : null}
              {job.mockups.length ? <div className="studio-mockups">
                {job.mockups.map((asset, index) => <figure key={asset.version}>
                  <img src={asset.url} alt={'Mockup de caneca, vista ' + (index === 0 ? 'frontal' : 'oposta')} />
                  <figcaption><span>{index === 0 ? 'Vista frontal' : 'Vista oposta'}</span>
                    <a href={asset.url} target="_blank" rel="noreferrer" download>Abrir</a></figcaption>
                </figure>)}
              </div> : null}
              {job.status === 'needs_review' ? <p className="studio-review">Confira a composição, os nomes e os mockups antes de aprovar ou enviar para produção.</p> : null}
              {job.status === 'failed' && !job.art ? <p className="studio-empty">Revise as configurações da API e tente gerar novamente.</p> : null}
            </> : <div className="studio-empty"><b aria-hidden="true">✳</b><p>Preencha o briefing para iniciar uma criação.</p></div>}
          </div>
        </section>
      </div>
    </div>
  );
}
