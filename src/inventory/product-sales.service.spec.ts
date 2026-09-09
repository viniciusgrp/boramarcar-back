import { BadRequestException } from '@nestjs/common';
import { ProductSalesService } from './product-sales.service';

describe('ProductSalesService', () => {
  it('requires at least one item', async () => {
    const service = new ProductSalesService({} as never, {} as never, {} as never, {} as never);

    await expect(
      service.createForTenant('tenant-1', { items: [] } as never, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
