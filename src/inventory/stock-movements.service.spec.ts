import { BadRequestException } from '@nestjs/common';
import { StockMovementsService } from './stock-movements.service';

describe('StockMovementsService', () => {
  it('requires a reason for adjustment outs', async () => {
    const productsService = {
      assertProductBelongsToTenant: jest.fn().mockResolvedValue({ name: 'Shampoo' }),
    };
    const service = new StockMovementsService({} as never, productsService as never);

    await expect(
      service.consumeStock({
        tenantId: 'tenant-1',
        productId: 'prod-1',
        quantity: 1,
        type: 'ADJUSTMENT_OUT',
        reason: ' ',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
