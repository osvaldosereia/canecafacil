import type { SupabaseClient } from '@supabase/supabase-js';
import { AdminWorkspace } from './AdminWorkspace';
import { AuthGate } from './auth/AuthGate';
import { StudioPage } from './pages/StudioPage';

export interface AppProps {
  client?: SupabaseClient;
}

function StudioOnlyAdmin({ client }: { client: SupabaseClient }) {
  async function signOut() {
    await client.auth.signOut();
  }

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div><strong>Caneca Fácil</strong><span> Estúdio</span></div>
        <button type="button" onClick={() => void signOut()}>Sair</button>
      </header>
      <main className="admin-page admin-page--studio">
        <StudioPage client={client} />
      </main>
    </div>
  );
}

export function App({ client }: AppProps) {
  if (!client) {
    return (
      <main className="setup-shell">
        <h1>Caneca Fácil</h1>
        <p>Painel operacional do atendimento e criação de canecas personalizadas.</p>
        <p>Configure a conexão pública do Supabase para acessar o Admin.</p>
      </main>
    );
  }

  const content = import.meta.env.VITE_STUDIO_ONLY === 'true'
    ? <StudioOnlyAdmin client={client} />
    : <AdminWorkspace client={client} />;

  return <AuthGate client={client}>{content}</AuthGate>;
}
