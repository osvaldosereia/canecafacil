import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { AdminWorkspace } from './AdminWorkspace';
import { AuthGate } from './auth/AuthGate';
import { readAdminAccessToken } from './lib/admin-access';
import { PublicCreatePage } from './pages/PublicCreatePage';

export interface AppProps {
  client?: SupabaseClient;
}

export function App({ client }: AppProps) {
  const isPagesBuild = import.meta.env.VITE_STUDIO_ONLY === 'true';
  const [adminAccessToken, setAdminAccessToken] = useState(() =>
    readAdminAccessToken(typeof window === 'undefined' ? '' : window.location.hash),
  );

  useEffect(() => {
    function syncAccessLink() {
      setAdminAccessToken(readAdminAccessToken(window.location.hash));
    }
    window.addEventListener('hashchange', syncAccessLink);
    return () => window.removeEventListener('hashchange', syncAccessLink);
  }, []);

  if (isPagesBuild && !adminAccessToken) {
    if (client) return <PublicCreatePage client={client} />;
    return (
      <main className="setup-shell">
        <h1>CanecaFácil</h1>
        <p>O ateliê está sendo preparado. Tente novamente em alguns minutos.</p>
      </main>
    );
  }

  if (!client) {
    return (
      <main className="setup-shell">
        <h1>Caneca Fácil</h1>
        <p>Painel operacional do atendimento e criação de canecas personalizadas.</p>
        <p>Configure a conexão pública do Supabase para acessar o Admin.</p>
      </main>
    );
  }

  if (isPagesBuild) {
    return <AdminWorkspace client={client} adminAccessToken={adminAccessToken} />;
  }

  return (
    <AuthGate client={client}>
      <AdminWorkspace client={client} />
    </AuthGate>
  );
}
