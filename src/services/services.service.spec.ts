import { createChainableQuery } from '../test-utils/supabase-mock';
import { ServicesService } from './services.service';

describe('ServicesService', () => {
  it('lists active services for the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [{
          id: 'svc-1',
          tenant_id: 'tenant-1',
          name: 'Corte',
          is_active: true,
          created_at: '2026-09-01T10:00:00.000Z',
          updated_at: '2026-09-10T10:00:00.000Z',
        }],
        error: null,
      }),
    );
    const service = new ServicesService(
      { getClient: () => ({ from }) } as never,
      {} as never,
    );

    const listed = await service.findAllByTenant('tenant-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.created_at).toBe('2026-09-01T10:00:00.000Z');
    expect(listed[0]?.updated_at).toBe('2026-09-10T10:00:00.000Z');
    expect(from).toHaveBeenCalledWith('services');
  });
});
