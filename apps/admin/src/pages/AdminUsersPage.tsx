import { useEffect, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readAdminAccessTokenFromLocation } from '../lib/admin-access';
import './AdminUsersPage.css';

type AdminUser = {
  user_id: string;
  role: 'owner' | 'operator' | 'viewer';
  is_active: boolean;
  display_name: string | null;
  email: string | null;
  created_at: string;
  last_login_at: string | null;
};

async function invoke<T>(client: SupabaseClient, body: Record<string, unknown>): Promise<T> {
  const token = readAdminAccessTokenFromLocation();
  const headers = token ? { 'x-caneca-admin-link': token } : undefined;
  const { data, error } = await client.functions.invoke('caneca-studio', { body, headers });
  if (error) {
    let code = 'admin_user_action_failed';
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const result = await context.json() as { error?: string };
        if (result.error) code = result.error;
      } catch { /* Keep the generic action error. */ }
    }
    throw new Error(code);
  }
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string') {
    throw new Error(data.error);
  }
  return data as T;
}

function userError(error: unknown): string {
  const code = error instanceof Error ? error.message : '';
  if (code === 'admin_auth_required' || code === 'admin_access_required') return 'O link privado do Admin não foi aceito. Abra o link atualizado.';
  if (code === 'admin_access_unavailable') return 'Não foi possível verificar o acesso ao painel. Tente novamente mais tarde.';
  if (code === 'admin_user_email_invalid') return 'Informe um e-mail válido.';
  if (code === 'admin_user_email_exists') return 'Já existe uma conta com esse e-mail.';
  if (code === 'admin_user_name_invalid') return 'Informe o nome do usuário.';
  if (code === 'admin_user_password_invalid') return 'A senha precisa ter pelo menos 10 caracteres.';
  if (code === 'admin_user_last_owner') return 'Mantenha pelo menos um proprietário ativo.';
  if (code === 'admin_user_not_found') return 'Esse usuário não está mais cadastrado.';
  if (code === 'admin_user_password_update_failed') return 'Não foi possível alterar a senha.';
  if (code === 'admin_user_create_failed') return 'Não foi possível criar a conta. Confira se o e-mail já está cadastrado.';
  if (code === 'admin_user_lookup_failed') return 'Não foi possível carregar os usuários.';
  if (code === 'admin_user_update_failed') return 'Não foi possível atualizar o acesso do usuário.';
  return 'Não foi possível concluir a ação. Atualize a página e tente novamente.';
}

function roleLabel(role: AdminUser['role']): string {
  return role === 'owner' ? 'Proprietário' : role === 'viewer' ? 'Consulta' : 'Operador';
}

export function AdminUsersPage({ client }: { client: SupabaseClient }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [editingPasswordFor, setEditingPasswordFor] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  async function loadUsers(showLoading = true) {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const result = await invoke<{ users: AdminUser[] }>(client, { action: 'admin_users_list' });
      setUsers(result.users || []);
    } catch (reason) {
      setError(userError(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadUsers(); }, [client]);

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving('new-user');
    setError('');
    setNotice('');
    try {
      await invoke(client, { action: 'admin_user_create', displayName: name, email, password });
      setName('');
      setEmail('');
      setPassword('');
      await loadUsers(false);
      setNotice('Usuário criado. A senha não fica visível depois do cadastro.');
    } catch (reason) {
      setError(userError(reason));
    } finally {
      setSaving('');
    }
  }

  async function updatePassword(event: FormEvent<HTMLFormElement>, userId: string) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('As senhas digitadas não são iguais.');
      return;
    }
    setSaving(userId);
    setError('');
    setNotice('');
    try {
      await invoke(client, { action: 'admin_user_set_password', userId, password: newPassword });
      setEditingPasswordFor(null);
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Senha alterada.');
    } catch (reason) {
      setError(userError(reason));
    } finally {
      setSaving('');
    }
  }

  async function toggleActive(user: AdminUser) {
    setSaving(user.user_id);
    setError('');
    setNotice('');
    try {
      await invoke(client, {
        action: 'admin_user_set_active',
        userId: user.user_id,
        isActive: !user.is_active,
      });
      await loadUsers(false);
      setNotice(user.is_active ? 'Acesso desativado.' : 'Acesso ativado.');
    } catch (reason) {
      setError(userError(reason));
    } finally {
      setSaving('');
    }
  }

  return (
    <section className="admin-users">
      <header className="admin-users-heading">
        <div>
          <p className="admin-users-kicker">ACESSO AO PAINEL</p>
          <h1>Usuários</h1>
          <p>Crie contas e altere senhas para quando o acesso por e-mail e senha for ativado.</p>
        </div>
        <button type="button" className="admin-users-refresh" onClick={() => void loadUsers()} disabled={loading}>
          Atualizar
        </button>
      </header>

      <aside className="admin-users-note">
        O painel continua abrindo pelo link privado. As senhas são enviadas diretamente ao serviço de autenticação e não aparecem nesta lista.
      </aside>

      {error ? <p className="admin-users-alert" role="alert">{error}</p> : null}
      {notice ? <p className="admin-users-notice" role="status">{notice}</p> : null}

      <form className="admin-user-create" onSubmit={(event) => void createUser(event)}>
        <div>
          <p className="admin-users-kicker">NOVA CONTA</p>
          <h2>Adicionar usuário</h2>
          <p>A conta ficará ativa e poderá ser usada quando o login for habilitado.</p>
        </div>
        <div className="admin-user-create-fields">
          <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} autoComplete="name" /></label>
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" /></label>
          <label>Senha inicial<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" /></label>
        </div>
        <button type="submit" className="admin-users-primary" disabled={saving === 'new-user'}>
          {saving === 'new-user' ? 'Criando…' : 'Criar usuário'}
        </button>
      </form>

      <div className="admin-users-list-heading">
        <div><h2>Contas cadastradas</h2><span>{users.length} usuário{users.length === 1 ? '' : 's'}</span></div>
      </div>

      {loading ? <p className="admin-users-empty" aria-live="polite">Carregando usuários…</p> : null}
      {!loading && !users.length ? <p className="admin-users-empty">Nenhuma conta administradora cadastrada.</p> : null}
      {!loading ? <div className="admin-users-list">
        {users.map((user) => (
          <article className="admin-user-card" key={user.user_id}>
            <div className="admin-user-summary">
              <span className="admin-user-avatar" aria-hidden="true">{user.display_name?.trim().charAt(0).toUpperCase() || 'U'}</span>
              <div><strong>{user.display_name || 'Usuário'}</strong><span>{user.email || 'E-mail não informado'}</span></div>
            </div>
            <div className="admin-user-meta">
              <span>{roleLabel(user.role)}</span>
              <span className={user.is_active ? 'is-active' : 'is-inactive'}>{user.is_active ? 'Ativo' : 'Desativado'}</span>
            </div>
            <div className="admin-user-actions">
              <button type="button" onClick={() => {
                setEditingPasswordFor(editingPasswordFor === user.user_id ? null : user.user_id);
                setNewPassword('');
                setConfirmPassword('');
                setError('');
              }}>
                Alterar senha
              </button>
              <button
                type="button"
                onClick={() => void toggleActive(user)}
                disabled={saving === user.user_id || (user.role === 'owner' && user.is_active)}
                title={user.role === 'owner' && user.is_active ? 'O proprietário ativo não pode ser desativado aqui.' : undefined}
              >
                {user.is_active ? 'Desativar' : 'Ativar'}
              </button>
            </div>
            {editingPasswordFor === user.user_id ? (
              <form className="admin-user-password-form" onSubmit={(event) => void updatePassword(event, user.user_id)}>
                <label>Nova senha<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" /></label>
                <label>Confirmar senha<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" /></label>
                <button type="submit" className="admin-users-primary" disabled={saving === user.user_id}>{saving === user.user_id ? 'Salvando…' : 'Salvar senha'}</button>
              </form>
            ) : null}
          </article>
        ))}
      </div> : null}
    </section>
  );
}
