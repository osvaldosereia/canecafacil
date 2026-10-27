import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import './StudioPage.css';

interface Asset { version: number; url: string }
interface Job {
  projectId: string;
  title: string | null;
  status: string;
  art: Asset | null;
  mockups: Asset[];
}
interface StudioPageProps { client: SupabaseClient; apiUrl: string }

const statusText: Record<string, string> = {
  generating_art: 'Criando a arte panorâmica…',
  generating_mockup: 'Preparando os mockups da caneca…',
  needs_review: 'Pronto para revisão',
  failed: 'A geração não foi concluída',
};
const apiErrors: Record<string, string> = {
  admin_auth_required: 'Sua sessão expirou. Entre novamente no Admin.',
  admin_access_required: 'Esta conta não tem acesso de administrador.',
  admin_access_unavailable: 'Não foi possível validar o acesso agora.',
  origin_not_allowed: 'A origem do Admin não está configurada na API.',
  studio_not_configured: 'A API ainda não tem a chave de geração de imagens.',
  invalid_studio_input: 'Confira os campos e a imagem de referência.',
  studio_job_start_failed: 'Não foi possível iniciar o trabalho de criação.',
  studio_job_lookup_failed: 'Não foi possível atualizar o trabalho.',
};
const finished = (status: string) => status === 'needs_review' || status === 'failed';

async function accessToken(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('admin_auth_required');
  return data.session.access_token;
}
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string') return body.error;
  } catch {}
  return 'studio_job_start_failed';
}

export function StudioPage({ client, apiUrl }: StudioPageProps) {
  const [mode, setMode] = useState<'from_scratch' | 'reference'>('from_scratch');
  const [reference, setReference] = useState<File | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const apiBase = apiUrl.trim().replace(/\/+$/, '');

  useEffect(() => {
    if (!job?.projectId || !apiBase || finished(job.status)) return;
    let active = true;
    let inFlight = false;

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const token = await accessToken(client);
        const response = await fetch(
          apiBase + '/v1/admin/studio/jobs/' + encodeURIComponent(job.projectId),
          { headers: { Authorization: 'Bearer ' + token } },
        );
        if (!response.ok) {
          const code = await errorCode(response);
          throw new Error(apiErrors[code] ?? 'Não foi possível atualizar o trabalho.');
        }
        const next = (await response.json()) as Job;
        if (!active) return;
        setJob((previous) => {
          if (!previous || previous.projectId !== next.projectId) return next;
          const art = next.art && previous.art?.version === next.art.version
            ? previous.art : next.art;
          const mockups = next.mockups.map((asset) =>
            previous.mockups.find((old) => old.version === asset.version) ?? asset,
          );
          return { ...next, art, mockups };
        });
        setError(null);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o trabalho.');
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => void refresh(), 2200);
    void refresh();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [apiBase, client, job?.projectId, job?.status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBase) {
      setError('Configure VITE_API_URL para conectar o Estúdio à API.');
      return;
    }
    const formElement = event.currentTarget;
    setBusy(true);
    setError(null);
    setNotice(null);
    setJob(null);
    try {
      const token = await accessToken(client);
      const form = new FormData(formElement);
      form.set('creationMode', mode);
      if (reference) form.set('reference', reference);
      const response = await fetch(apiBase + '/v1/admin/studio/jobs', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: form,
      });
      if (!response.ok) {
        const code = await errorCode(response);
        throw new Error(apiErrors[code] ?? 'Não foi possível iniciar a criação.');
      }
      const created = (await response.json()) as { projectId: string; status: string };
      setJob({
        projectId: created.projectId,
        title: form.get('title')?.toString() ?? null,
        status: created.status,
        art: null,
        mockups: [],
      });
      setNotice('Criação iniciada. O Estúdio atualizará os resultados automaticamente.');
      formElement.reset();
      setReference(null);
      setMode('from_scratch');
    } catch (cause) {
      setError(cause instanceof Error ? apiErrors[cause.message] ?? cause.message : 'Não foi possível iniciar a criação.');
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
          <p>Descreva a ideia. A automação prepara a arte e dois mockups privados para revisão.</p>
        </div>
        <span className="studio-private">Área interna</span>
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
            <button className="studio-submit" disabled={busy} type="submit">
              {busy ? 'Preparando…' : 'Gerar arte e mockups'}
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
