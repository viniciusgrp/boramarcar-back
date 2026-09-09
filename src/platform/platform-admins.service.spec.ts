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
    const service = new PlatformAdminsService({
      getClient: () => ({ from }),
    } as never);

    await expect(service.findActiveByUserId('user-1')).resolves.toMatchObject({
      id: 'pa-1',
    });
  });
});
