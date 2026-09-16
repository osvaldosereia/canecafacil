import { describe, expect, it, vi } from 'vitest';
import { AdminAuthorizationError, verifyAdminAccessToken } from './admin-auth';

function createFakeClient(options: {
  tokenUserId?: string | null;
  membershipUserId?: string | null;
}) {
  const membershipLookup = vi.fn(async (userId: string) => ({
    data:
      options.membershipUserId === userId
        ? { user_id: options.membershipUserId }
        : null,
    error: null,
  }));

  return {
    client: {
      auth: {
        getUser: vi.fn(async (_token: string) => ({
          data: {
            user: options.tokenUserId ? { id: options.tokenUserId } : null,
          },
          error: options.tokenUserId ? null : { message: 'invalid token' },
        })),
      },
      lookupAdminMembership: membershipLookup,
    },
    membershipLookup,
  };
}

describe('verifyAdminAccessToken', () => {
  it('rejects requests without a Bearer token before membership lookup', async () => {
    const { client, membershipLookup } = createFakeClient({
      tokenUserId: 'admin-user-id',
      membershipUserId: 'admin-user-id',
    });

    await expect(
      verifyAdminAccessToken(undefined, client),
    ).rejects.toMatchObject<AdminAuthorizationError>({ status: 401 });
    expect(membershipLookup).not.toHaveBeenCalled();
  });

  it('rejects an invalid Supabase token before membership lookup', async () => {
    const { client, membershipLookup } = createFakeClient({
      tokenUserId: null,
      membershipUserId: 'admin-user-id',
    });

    await expect(
      verifyAdminAccessToken('Bearer invalid-token', client),
    ).rejects.toMatchObject<AdminAuthorizationError>({ status: 401 });
    expect(membershipLookup).not.toHaveBeenCalled();
  });

  it('rejects an authenticated user who is not an Admin', async () => {
    const { client, membershipLookup } = createFakeClient({
      tokenUserId: 'normal-user-id',
      membershipUserId: null,
    });

    await expect(
      verifyAdminAccessToken('Bearer valid-token', client),
    ).rejects.toMatchObject<AdminAuthorizationError>({ status: 403 });
    expect(membershipLookup).toHaveBeenCalledWith('normal-user-id');
  });

  it('uses only the verified token user id for Admin membership', async () => {
    const { client, membershipLookup } = createFakeClient({
      tokenUserId: 'admin-user-id',
      membershipUserId: 'admin-user-id',
    });

    await expect(
      verifyAdminAccessToken('Bearer valid-token', client),
    ).resolves.toEqual({ userId: 'admin-user-id' });
    expect(membershipLookup).toHaveBeenCalledTimes(1);
    expect(membershipLookup).toHaveBeenCalledWith('admin-user-id');
  });
});
