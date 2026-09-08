import { createChainableQuery } from '../test-utils/supabase-mock';
import { TenantUsersService } from './tenant-users.service';

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
});
