import { BadRequestException } from '@nestjs/common';
import { createChainableQuery } from '../test-utils/supabase-mock';
import { DEPOSIT_SUBACCOUNT_REQUIRED_MESSAGE } from '../tenants/constants/deposit-feature.constants';
import { ServicesService } from './services.service';

describe('ServicesService', () => {
  it('lists active services for the tenant', async () => {
    const from = jest.fn(() =>
      createChainableQuery({
        data: [{
          id: 'svc-1',
          tenant_id: 'tenant-1',
          name: 'Corte',
          is_active: true,
          created_at: '2026-09-01T10:00:00.000Z',
          updated_at: '2026-09-10T10:00:00.000Z',
        }],
        error: null,
      }),
    );
    const service = new ServicesService(
      { getClient: () => ({ from }) } as never,
      {} as never,
    );

    const listed = await service.findAllByTenant('tenant-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.created_at).toBe('2026-09-01T10:00:00.000Z');
    expect(listed[0]?.updated_at).toBe('2026-09-10T10:00:00.000Z');
    expect(from).toHaveBeenCalledWith('services');
  });

  it('rejects a deposit service when the Asaas subaccount cannot charge', async () => {
    const from = jest.fn(() =>
      createChainableQuery({ data: null, error: null }),
    );
    const service = new ServicesService(
      { getClient: () => ({ from }) } as never,
      {} as never,
    );

    await expect(
      service.createForTenant('tenant-1', 'ELITE', true, false, {
        name: 'Corte',
        durationMinutes: 60,
        price: 50,
        requiresDeposit: true,
        depositAmount: 20,
      }),
    ).rejects.toThrow(DEPOSIT_SUBACCOUNT_REQUIRED_MESSAGE);
    expect(from).not.toHaveBeenCalled();
    await expect(
      service.createForTenant('tenant-1', 'ELITE', true, false, {
        name: 'Corte',
        durationMinutes: 60,
        price: 50,
        requiresDeposit: true,
        depositAmount: 20,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
