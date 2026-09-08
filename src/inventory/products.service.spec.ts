import { createChainableQuery } from '../test-utils/supabase-mock';
import { ProductsService } from './products.service';

describe('ProductsService', () => {
  it('lists managed products for the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [
          {
            id: 'prod-1',
            tenant_id: 'tenant-1',
            name: 'Shampoo',
            current_stock: 2,
            min_stock_alert: 3,
            cost_price: 10,
            sale_price: 20,
          },
        ],
        error: null,
      }),
    );
    const service = new ProductsService({
      getClient: () => ({ from }),
    } as never);

    await expect(service.findAllManagedByTenant('tenant-1')).resolves.toHaveLength(1);
  });
});
