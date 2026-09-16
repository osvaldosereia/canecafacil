import type { SupabaseClient } from '@supabase/supabase-js';

interface VerifiedUser {
  id: string;
}

interface AuthUserResult {
  data: { user: VerifiedUser | null };
  error: { message?: string } | null;
}

interface AdminMembershipResult {
  data: { user_id: string } | null;
  error: { message?: string } | null;
}

export interface AdminAuthClient {
  auth: {
    getUser(accessToken: string): PromiseLike<AuthUserResult>;
  };
  lookupAdminMembership(userId: string): PromiseLike<AdminMembershipResult>;
}

export class AdminAuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 | 500,
  ) {
    super(message);
    this.name = 'AdminAuthorizationError';
  }
}

function readBearerToken(authorizationHeader: string | undefined): string {
  const match = authorizationHeader?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  if (!token) {
    throw new AdminAuthorizationError('Admin authentication required', 401);
  }

  return token;
}

export async function verifyAdminAccessToken(
  authorizationHeader: string | undefined,
  client: AdminAuthClient,
): Promise<{ userId: string }> {
  const token = readBearerToken(authorizationHeader);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  const userId = userData.user?.id;

  if (userError || !userId) {
    throw new AdminAuthorizationError('Invalid Admin session', 401);
  }

  const { data: membership, error: membershipError } =
    await client.lookupAdminMembership(userId);

  if (membershipError) {
    throw new AdminAuthorizationError('Admin authorization lookup failed', 500);
  }

  if (!membership || membership.user_id !== userId) {
    throw new AdminAuthorizationError('Admin access required', 403);
  }

  return { userId };
}

export function createSupabaseAdminAuthClient(
  client: SupabaseClient,
): AdminAuthClient {
  return {
    auth: {
      getUser(accessToken) {
        return client.auth.getUser(accessToken);
      },
    },
    async lookupAdminMembership(userId) {
      const { data, error } = await client
        .from('admin_membership_lookup')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();

      return {
        data:
          data && typeof data.user_id === 'string'
            ? { user_id: data.user_id }
            : null,
        error,
      };
    },
  };
}
