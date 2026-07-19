import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseService } from '../supabase/supabase.service';
import { LoyaltyService } from './loyalty.service';
import type { ReferralService } from './referral.service';
import {
  LOYALTY_COMPLETION_EARN_DESCRIPTION,
  LOYALTY_REFUND_REDEEM_DESCRIPTION,
  LOYALTY_RESTORE_REDEEM_DESCRIPTION,
} from './utils/loyalty-ledger.constants';

type QueryResult = {
  data?: unknown;
  error?: { message: string } | null;
};

function createChain(result: QueryResult = { data: null, error: null }) {
  const chain: Record<string, jest.Mock> = {};
  const methods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'gt',
    'gte',
    'lte',
    'ilike',
    'not',
    'order',
    'limit',
    'maybeSingle',
    'single',
  ];

  for (const method of methods) {
    chain[method] = jest.fn(() => chain);
  }

  chain.maybeSingle = jest.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  chain.single = jest.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));

  // Terminal thenable for chains that await the builder directly
  (chain as { then?: unknown }).then = (
    resolve: (value: QueryResult) => unknown,
  ) =>
    Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
    }).then(resolve);

  return chain;
}

describe('LoyaltyService', () => {
  const tenantId = 'tenant-1';
  const customerId = 'customer-1';
  const rewardId = 'reward-1';
  const appointmentId = 'appt-1';

  const customerRow = {
    id: customerId,
    tenant_id: tenantId,
    name: 'Ana',
    phone: '5511999999999',
    points_balance: 100,
    referral_code: 'ABC123',
    referred_by_id: null,
    auth_user_id: null,
    email: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const rewardRow = {
    id: rewardId,
    tenant_id: tenantId,
    title: 'Corte grátis',
    points_cost: 50,
    service_id: 'service-1',
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  const settingsRow = {
    tenant_id: tenantId,
    is_active: true,
    points_per_currency: 1,
    default_service_points: 0,
    expiration_days: null,
    welcome_bonus: 10,
    refund_points_on_no_show: true,
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  it('redeems for appointment via atomic debit RPC', async () => {
    const rpc = jest.fn(async () => ({ data: 50, error: null }));
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_settings') {
        return createChain({ data: settingsRow });
      }
      if (table === 'customers') {
        return createChain({ data: customerRow });
      }
      if (table === 'loyalty_rewards') {
        return createChain({ data: rewardRow });
      }
      if (table === 'loyalty_transactions') {
        return createChain({
          data: {
            id: 'tx-1',
            tenant_id: tenantId,
            customer_id: customerId,
            type: 'REDEEMED',
            points: 50,
            description: 'Resgate no agendamento: Corte grátis',
            appointment_id: appointmentId,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        });
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await service.redeemRewardForAppointment({
      tenantId,
      customerId,
      rewardId,
      appointmentId,
    });

    expect(rpc).toHaveBeenCalledWith('debit_customer_loyalty_points', {
      p_customer_id: customerId,
      p_tenant_id: tenantId,
      p_points: 50,
    });
  });

  it('rejects redeem when RPC reports insufficient points', async () => {
    const rpc = jest.fn(async () => ({
      data: null,
      error: { message: 'insufficient_loyalty_points' },
    }));
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_settings') {
        return createChain({ data: settingsRow });
      }
      if (table === 'customers') {
        return createChain({ data: customerRow });
      }
      if (table === 'loyalty_rewards') {
        return createChain({ data: rewardRow });
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await expect(
      service.redeemRewardForAppointment({
        tenantId,
        customerId,
        rewardId,
        appointmentId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refunds net charged redeem points on cancel', async () => {
    const rpc = jest.fn(async () => ({ data: 150, error: null }));
    let txSelectCalls = 0;
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_transactions') {
        txSelectCalls += 1;
        if (txSelectCalls === 1) {
          return createChain({
            data: [
              {
                customer_id: customerId,
                points: 50,
                type: 'REDEEMED',
                description: 'Resgate no agendamento: Corte grátis',
              },
            ],
          });
        }
        return createChain({
          data: {
            id: 'tx-refund',
            tenant_id: tenantId,
            customer_id: customerId,
            type: 'EARNED',
            points: 50,
            description: LOYALTY_REFUND_REDEEM_DESCRIPTION,
            appointment_id: appointmentId,
            created_at: '2026-01-02T00:00:00.000Z',
          },
        });
      }
      if (table === 'customers') {
        return createChain({ data: customerRow });
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await service.refundRedeemedPointsForAppointment({
      tenantId,
      appointmentId,
    });

    expect(rpc).toHaveBeenCalledWith('credit_customer_loyalty_points', {
      p_customer_id: customerId,
      p_tenant_id: tenantId,
      p_points: 50,
    });
  });

  it('restore fails when balance is insufficient (no mint)', async () => {
    const rpc = jest.fn(async () => ({
      data: null,
      error: { message: 'insufficient_loyalty_points' },
    }));
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_transactions') {
        return createChain({
          data: [
            {
              customer_id: customerId,
              points: 50,
              type: 'REDEEMED',
              description: 'Resgate no agendamento: Corte grátis',
            },
            {
              customer_id: customerId,
              points: 50,
              type: 'EARNED',
              description: LOYALTY_REFUND_REDEEM_DESCRIPTION,
            },
          ],
        });
      }
      if (table === 'customers') {
        return createChain({
          data: { ...customerRow, points_balance: 10 },
        });
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await expect(
      service.restoreRedeemedPointsForAppointment({
        tenantId,
        appointmentId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(rpc).toHaveBeenCalledWith('debit_customer_loyalty_points', {
      p_customer_id: customerId,
      p_tenant_id: tenantId,
      p_points: 50,
    });
  });

  it('skips award when completion earn already exists', async () => {
    const rpc = jest.fn();
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_settings') {
        return createChain({ data: settingsRow });
      }
      if (table === 'loyalty_transactions') {
        return createChain({
          data: { id: 'existing-earn' },
        });
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await service.awardPointsForCompletedAppointment({
      tenantId,
      appointmentId,
      customerId,
      customerName: 'Ana',
      customerPhone: '11999999999',
      totalPrice: 100,
    });

    expect(rpc).not.toHaveBeenCalled();
  });

  it('rejects inactive reward on appointment redeem', async () => {
    const rpc = jest.fn();
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_settings') {
        return createChain({ data: settingsRow });
      }
      if (table === 'customers') {
        return createChain({ data: customerRow });
      }
      if (table === 'loyalty_rewards') {
        return createChain({ data: { ...rewardRow, is_active: false } });
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await expect(
      service.redeemRewardForAppointment({
        tenantId,
        customerId,
        rewardId,
        appointmentId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('propagates unexpected RPC errors', async () => {
    const rpc = jest.fn(async () => ({
      data: null,
      error: { message: 'db down' },
    }));
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_settings') {
        return createChain({ data: settingsRow });
      }
      if (table === 'customers') {
        return createChain({ data: customerRow });
      }
      if (table === 'loyalty_rewards') {
        return createChain({ data: rewardRow });
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await expect(
      service.redeemRewardForAppointment({
        tenantId,
        customerId,
        rewardId,
        appointmentId,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('restores with restore ledger description when refunded', async () => {
    const rpc = jest.fn(async () => ({ data: 50, error: null }));
    let txCalls = 0;
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_transactions') {
        txCalls += 1;
        if (txCalls === 1) {
          return createChain({
            data: [
              {
                customer_id: customerId,
                points: 50,
                type: 'REDEEMED',
                description: 'Resgate no agendamento: Corte grátis',
              },
              {
                customer_id: customerId,
                points: 50,
                type: 'EARNED',
                description: LOYALTY_REFUND_REDEEM_DESCRIPTION,
              },
            ],
          });
        }
        return createChain({
          data: {
            id: 'tx-restore',
            tenant_id: tenantId,
            customer_id: customerId,
            type: 'REDEEMED',
            points: 50,
            description: LOYALTY_RESTORE_REDEEM_DESCRIPTION,
            appointment_id: appointmentId,
            created_at: '2026-01-03T00:00:00.000Z',
          },
        });
      }
      if (table === 'customers') {
        return createChain({ data: customerRow });
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await service.restoreRedeemedPointsForAppointment({
      tenantId,
      appointmentId,
    });

    expect(rpc).toHaveBeenCalledWith('debit_customer_loyalty_points', {
      p_customer_id: customerId,
      p_tenant_id: tenantId,
      p_points: 50,
    });
  });

  it('award uses completion earn description constant', async () => {
    const rpc = jest.fn(async () => ({ data: 200, error: null }));
    let txCalls = 0;
    const inserted: Record<string, unknown>[] = [];
    const from = jest.fn((table: string) => {
      if (table === 'loyalty_settings') {
        return createChain({ data: settingsRow });
      }
      if (table === 'customers') {
        return createChain({ data: customerRow });
      }
      if (table === 'loyalty_transactions') {
        txCalls += 1;
        if (txCalls === 1) {
          // hasCompletionEarnForAppointment → none
          return createChain({ data: null });
        }
        const chain = createChain({
          data: {
            id: 'tx-earn',
            tenant_id: tenantId,
            customer_id: customerId,
            type: 'EARNED',
            points: 100,
            description: LOYALTY_COMPLETION_EARN_DESCRIPTION,
            appointment_id: appointmentId,
            created_at: '2026-01-01T00:00:00.000Z',
          },
        });
        chain.insert = jest.fn((payload: Record<string, unknown>) => {
          inserted.push(payload);
          return chain;
        });
        return chain;
      }
      return createChain();
    });

    const service = new LoyaltyService(
      { getClient: () => ({ from, rpc }) } as unknown as SupabaseService,
      {} as ReferralService,
    );

    await service.awardPointsForCompletedAppointment({
      tenantId,
      appointmentId,
      customerId,
      customerName: 'Ana',
      customerPhone: '11999999999',
      totalPrice: 100,
    });

    expect(rpc).toHaveBeenCalledWith('credit_customer_loyalty_points', {
      p_customer_id: customerId,
      p_tenant_id: tenantId,
      p_points: 100,
    });
    expect(inserted[0]?.description).toBe(LOYALTY_COMPLETION_EARN_DESCRIPTION);
  });
});
