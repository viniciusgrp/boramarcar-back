import { createChainableQuery } from '../test-utils/supabase-mock';
import { ServicesService } from './services.service';

describe('ServicesService', () => {
  it('lists active services for the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [{ id: 'svc-1', tenant_id: 'tenant-1', name: 'Corte', is_active: true }],
        error: null,
      }),
    );
    const service = new ServicesService(
      { getClient: () => ({ from }) } as never,
      {} as never,
    );

    await expect(service.findAllByTenant('tenant-1')).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledWith('services');
  });
});
