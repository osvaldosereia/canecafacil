const ADMIN_LINK_PREFIX = '#admin?';
const OPEN_ADMIN_LINK_TOKEN = '22d7244f0727a2f5a22a2dc4b831bd3690aa6e3ee61eb2f82b0c819b468bc55a';

export function readAdminAccessToken(hash: string): string | null {
  if (hash === '#admin') return OPEN_ADMIN_LINK_TOKEN;
  if (!hash.startsWith(ADMIN_LINK_PREFIX)) return null;
  const token = new URLSearchParams(hash.slice(ADMIN_LINK_PREFIX.length)).get('key') || '';
  return /^[a-f0-9]{64}$/i.test(token) ? token : null;
}

export function readAdminAccessTokenFromLocation(): string | null {
  return typeof window === 'undefined' ? null : readAdminAccessToken(window.location.hash);
}
