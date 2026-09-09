import { ForbiddenException } from '@nestjs/common';
import { RecurringExpensesService } from './recurring-expenses.service';

describe('RecurringExpensesService', () => {
  it('requires Pro or Elite to list templates', async () => {
    const service = new RecurringExpensesService({} as never);

    await expect(service.listTemplates('tenant-1', 'SOLO')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
