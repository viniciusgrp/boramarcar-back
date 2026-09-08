import { createChainableQuery } from '../test-utils/supabase-mock';
import { SuppliersService } from './suppliers.service';

describe('SuppliersService', () => {
  it('lists suppliers scoped to the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [{ id: 'sup-1', tenant_id: 'tenant-1', name: 'Fornecedor' }],
        error: null,
      }),
    );
    const service = new SuppliersService({
      getClient: () => ({ from }),
    } as never);

    await expect(service.findAllByTenant('tenant-1')).resolves.toHaveLength(1);
    expect(from).toHaveBeenCalledWith('suppliers');
  });
});
