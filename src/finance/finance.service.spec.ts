import { ForbiddenException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { createChainableQuery } from '../test-utils/supabase-mock';

describe('FinanceService', () => {
  it('blocks Solo tenants from finance reports', () => {
    const service = new FinanceService({} as never, {} as never);

    expect(() => service.assertFinanceAccess('SOLO')).toThrow(
      ForbiddenException,
    );
  });

  it('removes appointment cash entries on reverse instead of inserting an expense', async () => {
    const deleteEntries = createChainableQuery({ data: null, error: null });
    const deletePayouts = createChainableQuery({ data: null, error: null });
    const from = jest.fn((table: string) => {
      if (table === 'cash_flow_entries') {
        return deleteEntries;
      }
      if (table === 'employee_payouts') {
        return deletePayouts;
      }
      return createChainableQuery({ data: null, error: null });
    });

    const service = new FinanceService(
      { getClient: () => ({ from }) } as never,
      {} as never,
    );

    await service.reverseCompletedAppointmentCashFlow({
      tenantId: 'tenant-1',
      appointmentId: 'appt-1',
    });

    expect(from).toHaveBeenCalledWith('cash_flow_entries');
    expect(deleteEntries.delete).toHaveBeenCalled();
    expect(deleteEntries.in).toHaveBeenCalledWith('category', [
      'APPOINTMENT',
      'APPOINTMENT_REVERSAL',
    ]);
    expect(deleteEntries.insert).not.toHaveBeenCalled();
  });
});
