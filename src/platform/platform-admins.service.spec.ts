import { UnauthorizedException } from '@nestjs/common';
import { createChainableQuery } from '../test-utils/supabase-mock';
import { PlatformAdminsService } from './platform-admins.service';

describe('PlatformAdminsService', () => {
  it('returns the active platform admin for a user', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: { id: 'pa-1', user_id: 'user-1', is_active: true },
        error: null,
      }),
    );
    const service = new PlatformAdminsService(
      { getClient: () => ({ from }) } as never,
      { get: () => undefined } as never,
    );

    await expect(service.findActiveByUserId('user-1')).resolves.toMatchObject({
      id: 'pa-1',
    });
  });

  it('rejects passphrase login when the phrase is wrong', async () => {
    const service = new PlatformAdminsService(
      { getClient: () => ({ from: jest.fn() }) } as never,
      { get: () => 'correct-phrase' } as never,
    );

    await expect(service.loginWithPassphrase('nope')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('creates the admin auth user and mints a password session', async () => {
    const listUsers = jest.fn().mockResolvedValue({
      data: { users: [] },
      error: null,
    });
    const createUser = jest.fn().mockResolvedValue({
      data: { user: { id: 'admin-user', email: 'admin@boramarcar.internal' } },
      error: null,
    });
    const from = jest.fn(() =>
      createChainableQuery({ data: null, error: null }),
    );
    const mintUserPasswordSession = jest.fn().mockResolvedValue({
      access_token: 'tok',
      refresh_token: 'ref',
    });

    const service = new PlatformAdminsService(
      {
        getClient: () => ({
          from,
          auth: { admin: { listUsers, createUser } },
        }),
        mintUserPasswordSession,
      } as never,
      { get: () => 'correct-phrase' } as never,
    );

    await expect(service.loginWithPassphrase('correct-phrase')).resolves.toEqual({
      access_token: 'tok',
      refresh_token: 'ref',
    });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@boramarcar.internal',
        user_metadata: { full_name: 'admin' },
      }),
    );
    expect(mintUserPasswordSession).toHaveBeenCalledWith(
      'admin@boramarcar.internal',
      'correct-phrase',
      { skipSignOut: true },
    );
  });
});
