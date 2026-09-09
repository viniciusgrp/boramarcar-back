import { createChainableQuery } from '../test-utils/supabase-mock';
import { ProductCategoriesService } from './product-categories.service';

describe('ProductCategoriesService', () => {
  it('lists categories scoped to the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [{ id: 'cat-1', tenant_id: 'tenant-1', name: 'Tintas' }],
        error: null,
      }),
    );
    const service = new ProductCategoriesService({
      getClient: () => ({ from }),
    } as never);

    const rows = await service.findAllByTenant('tenant-1');

    expect(rows).toHaveLength(1);
    expect(from).toHaveBeenCalledWith('product_categories');
  });
});
