import { ForbiddenException } from '@nestjs/common';
import { CashRegisterService } from './cash-register.service';

describe('CashRegisterService', () => {
  it('blocks Solo tenants from finance cash register', async () => {
    const service = new CashRegisterService({} as never);

    await expect(
      service.getCashRegisterStatus('tenant-1', 'SOLO'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
