import { BadRequestException } from '@nestjs/common';
import { createChainableQuery } from '../test-utils/supabase-mock';
import { TenantUsersService } from './tenant-users.service';

const pendingInvite = {
  id: 'invite-1',
  tenant_id: 'tenant-1',
  email: 'colab@example.com',
  role: 'PROFESSIONAL',
  professional_id: null,
  token: 'token-1',
  invited_by_user_id: 'owner-1',
  expires_at: '2099-01-01T00:00:00.000Z',
  accepted_at: null,
  created_at: '2099-01-01T00:00:00.000Z',
};

describe('TenantUsersService', () => {
  it('returns null when the user has no membership', async () => {
    const from = jest.fn(() => createChainableQuery({ data: null, error: null }));
    const service = new TenantUsersService(
      { getClient: () => ({ from }) } as never,
      {} as never,
      { get: () => undefined } as never,
    );

    await expect(service.findByUserId('user-1')).resolves.toBeNull();
  });

  it('returns the inviter name and role on preview', async () => {
    const from = jest.fn((table: string) => {
      if (table === 'tenant_user_invites') {
        return createChainableQuery({ data: pendingInvite, error: null });
      }

      return createChainableQuery({ data: { name: 'Barbearia Central' }, error: null });
    });
    const getUserById = jest.fn().mockResolvedValue({
      data: {
        user: {
          email: 'dono@example.com',
          user_metadata: { full_name: 'Marina Silva' },
        },
      },
      error: null,
    });
    const service = new TenantUsersService(
      {
        getClient: () => ({
          from,
          auth: { admin: { getUserById } },
        }),
      } as never,
      {} as never,
      { get: () => undefined } as never,
    );

    await expect(service.previewInvite('token-1')).resolves.toEqual(
      expect.objectContaining({
        invitedByName: 'Marina Silva',
        role: 'PROFESSIONAL',
        tenantName: 'Barbearia Central',
      }),
    );
  });

  it('rejects signup when the name is empty', async () => {
    const from = jest.fn(() =>
      createChainableQuery({ data: pendingInvite, error: null }),
    );
    const service = new TenantUsersService(
      { getClient: () => ({ from }) } as never,
      {} as never,
      { get: () => undefined } as never,
    );

    await expect(
      service.signupViaInvite({
        token: 'token-1',
        fullName: '   ',
        password: 'Senha123',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
