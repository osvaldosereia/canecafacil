const ADMIN_LINK_PREFIX = '#admin?';

export function readAdminAccessToken(hash: string): string | null {
  if (!hash.startsWith(ADMIN_LINK_PREFIX)) return null;
  const token = new URLSearchParams(hash.slice(ADMIN_LINK_PREFIX.length)).get('key') || '';
  return /^[a-f0-9]{64}$/i.test(token) ? token : null;
}

export function readAdminAccessTokenFromLocation(): string | null {
  return typeof window === 'undefined' ? null : readAdminAccessToken(window.location.hash);
}
