import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { SupabaseService } from '../supabase/supabase.service';
import { CouponsService } from './coupons.service';
import type { Coupon } from './entities/coupon.entity';

type QueryResult = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
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

  (chain as { then?: unknown }).then = (
    resolve: (value: QueryResult) => unknown,
  ) =>
    Promise.resolve({
      data: result.data ?? null,
      error: result.error ?? null,
      count: result.count ?? null,
    }).then(resolve);

  return chain;
}

describe('CouponsService', () => {
  const tenantId = 'tenant-1';
  const appointmentId = 'appt-1';
  const customerPhone = '5511999999999';

  const baseCouponRow: Coupon = {
    id: 'coupon-1',
    tenant_id: tenantId,
    code: 'BEMVINDO10',
    description: null,
    discount_type: 'PERCENTAGE',
    discount_value: 10,
    max_uses: null,
    used_count: 0,
    max_uses_per_customer: null,
    first_visit_only: false,
    min_purchase_amount: null,
    valid_from: null,
    valid_until: null,
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };

  function buildService(
    fromImpl: (table: string) => ReturnType<typeof createChain>,
    rpc: jest.Mock<
      Promise<{ data: null; error: { message: string } | null }>
    > = jest.fn(async () => ({ data: null, error: null })),
  ) {
    const from = jest.fn(fromImpl);
    const service = new CouponsService({
      getClient: () => ({ from, rpc }),
    } as unknown as SupabaseService);
    return { service, from, rpc };
  }

  it('computes percentage discount for a valid coupon', async () => {
    const { service } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({ data: baseCouponRow });
      }
      return createChain();
    });

    const result = await service.validateCouponForBooking({
      tenantId,
      code: 'bemvindo10',
      totalPrice: 100,
    });

    expect(result.discountAmount).toBe(10);
    expect(result.finalPrice).toBe(90);
  });

  it('computes fixed amount discount clamped to totalPrice', async () => {
    const { service } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({
          data: { ...baseCouponRow, discount_type: 'FIXED_AMOUNT', discount_value: 50 },
        });
      }
      return createChain();
    });

    const result = await service.validateCouponForBooking({
      tenantId,
      code: 'BEMVINDO10',
      totalPrice: 30,
    });

    expect(result.discountAmount).toBe(30);
    expect(result.finalPrice).toBe(0);
  });

  it('throws NotFoundException when coupon does not exist', async () => {
    const { service } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({ data: null });
      }
      return createChain();
    });

    await expect(
      service.validateCouponForBooking({
        tenantId,
        code: 'INEXISTENTE',
        totalPrice: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects an expired coupon', async () => {
    const { service } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({
          data: { ...baseCouponRow, valid_until: '2020-01-01T00:00:00.000Z' },
        });
      }
      return createChain();
    });

    await expect(
      service.validateCouponForBooking({
        tenantId,
        code: 'BEMVINDO10',
        totalPrice: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when total price is below the minimum purchase amount', async () => {
    const { service } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({
          data: { ...baseCouponRow, min_purchase_amount: 50 },
        });
      }
      return createChain();
    });

    await expect(
      service.validateCouponForBooking({
        tenantId,
        code: 'BEMVINDO10',
        totalPrice: 30,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a first-visit-only coupon for a returning customer', async () => {
    const { service } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({
          data: { ...baseCouponRow, first_visit_only: true },
        });
      }
      if (table === 'appointments') {
        return createChain({ data: { id: 'previous-appt' } });
      }
      return createChain();
    });

    await expect(
      service.validateCouponForBooking({
        tenantId,
        code: 'BEMVINDO10',
        totalPrice: 100,
        customerPhone,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a first-visit-only coupon when the phone has no prior appointment', async () => {
    const { service } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({
          data: { ...baseCouponRow, first_visit_only: true },
        });
      }
      if (table === 'appointments') {
        return createChain({ data: null });
      }
      return createChain();
    });

    const result = await service.validateCouponForBooking({
      tenantId,
      code: 'BEMVINDO10',
      totalPrice: 100,
      customerPhone,
    });

    expect(result.discountAmount).toBe(10);
  });

  it('rejects when the customer already used the coupon the maximum times', async () => {
    const { service } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({
          data: { ...baseCouponRow, max_uses_per_customer: 1 },
        });
      }
      if (table === 'coupon_redemptions') {
        return createChain({ data: [], count: 1 });
      }
      return createChain();
    });

    await expect(
      service.validateCouponForBooking({
        tenantId,
        code: 'BEMVINDO10',
        totalPrice: 100,
        customerPhone,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redeems a coupon atomically and records the ledger entry', async () => {
    const { service, rpc, from } = buildService((table) => {
      if (table === 'coupons') {
        return createChain({ data: baseCouponRow });
      }
      if (table === 'coupon_redemptions') {
        return createChain({ data: { id: 'redemption-1' } });
      }
      return createChain();
    });

    const result = await service.redeemCouponForAppointment({
      tenantId,
      code: 'BEMVINDO10',
      totalPrice: 100,
      appointmentId,
      customerPhone,
    });

    expect(rpc).toHaveBeenCalledWith('redeem_coupon_atomic', {
      p_coupon_id: baseCouponRow.id,
      p_tenant_id: tenantId,
    });
    expect(from).toHaveBeenCalledWith('coupon_redemptions');
    expect(result.discountAmount).toBe(10);
  });

  it('throws BadRequestException when the RPC reports the usage limit was reached', async () => {
    const rpc = jest.fn(async () => ({
      data: null,
      error: { message: 'coupon_redemption_limit_reached' },
    }));

    const { service } = buildService(
      (table) => {
        if (table === 'coupons') {
          return createChain({ data: baseCouponRow });
        }
        return createChain();
      },
      rpc,
    );

    await expect(
      service.redeemCouponForAppointment({
        tenantId,
        code: 'BEMVINDO10',
        totalPrice: 100,
        appointmentId,
        customerPhone,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
