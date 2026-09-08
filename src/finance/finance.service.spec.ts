import { ForbiddenException } from '@nestjs/common';
import { FinanceService } from './finance.service';

describe('FinanceService', () => {
  it('blocks Solo tenants from finance reports', () => {
    const service = new FinanceService({} as never, {} as never);

    expect(() => service.assertFinanceAccess('SOLO')).toThrow(
      ForbiddenException,
    );
  });
});
