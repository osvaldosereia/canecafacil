import type { SupabaseClient } from '@supabase/supabase-js';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('identifica o painel como Caneca Fácil quando ainda não há cliente configurado', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('Caneca Fácil');
  });

  it('protege o workspace quando recebe o cliente Supabase', () => {
    const client = {} as SupabaseClient;
    const html = renderToStaticMarkup(<App client={client} />);

    expect(html).toContain('Verificando acesso');
    expect(html).not.toContain('Painel operacional do atendimento');
  });

  it('protege o Estúdio do GitHub Pages com a autenticação administrativa', () => {
    vi.stubEnv('VITE_STUDIO_ONLY', 'true');
    try {
      const client = {} as SupabaseClient;
      const html = renderToStaticMarkup(<App client={client} />);

      expect(html).toContain('Verificando acesso');
      expect(html).not.toContain('Estúdio de Canecas');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
