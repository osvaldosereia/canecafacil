const ADMIN_LINK_PREFIX = '#admin?';
const ADMIN_SESSION_KEY = 'canecafacil-admin-access-v1';
const TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

export function readAdminAccessToken(hash: string): string | null {
  if (hash !== '#admin' && !hash.startsWith(ADMIN_LINK_PREFIX)) return null;

  const query = hash.startsWith(ADMIN_LINK_PREFIX)
    ? hash.slice(ADMIN_LINK_PREFIX.length)
    : '';
  const params = new URLSearchParams(query);
  if (params.has('key')) {
    const token = params.get('key') || '';
    if (!TOKEN_PATTERN.test(token)) return null;
    try {
      if (typeof window !== 'undefined') window.sessionStorage.setItem(ADMIN_SESSION_KEY, token);
    } catch { /* Session storage may be unavailable in private browsing. */ }
    return token;
  }

  try {
    if (typeof window === 'undefined') return null;
    const token = window.sessionStorage.getItem(ADMIN_SESSION_KEY) || '';
    return TOKEN_PATTERN.test(token) ? token : null;
  } catch {
    return null;
  }
}

export function readAdminAccessTokenFromLocation(): string | null {
  return typeof window === 'undefined' ? null : readAdminAccessToken(window.location.hash);
}
