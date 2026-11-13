import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import { createChainableQuery } from '../test-utils/supabase-mock';

function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    name: 'Studio',
    slug: 'studio',
    plan_tier: 'PRO',
    subscription_status: 'ACTIVE',
    asaas_customer_id: 'cus_1',
    asaas_subscription_id: 'sub_1',
    asaas_pending_payment_id: null,
    asaas_wallet_id: 'wal_1',
    asaas_charges_enabled: true,
    asaas_details_submitted: true,
    subscription_expires_at: '2026-12-27T03:00:00.000Z',
    subscription_cancel_at: null,
    pending_plan_tier: null,
    pending_plan_payment_id: null,
    pending_plan_invoice_url: null,
    pending_plan_effective_at: null,
    ...overrides,
  } as Tenant;
}

const asaasEnv = {
  APP_ENV: 'production',
  ASAAS_API_KEY: 'key',
  ASAAS_WEBHOOK_TOKEN: 'whsec',
  ASAAS_SOLO_VALUE_BRL: '34.90',
  ASAAS_PRO_VALUE_BRL: '69.90',
  ASAAS_ELITE_VALUE_BRL: '120',
  ASAAS_SUPPORT_AI_VALUE_BRL: '29.90',
};

function buildService(
  tenants: Partial<TenantsService> = {},
  asaasClient: Record<string, unknown> = {},
  from: jest.Mock = jest.fn(() =>
    createChainableQuery({ data: null, error: null }),
  ),
) {
  const configService = {
    get: (key: string) => asaasEnv[key as keyof typeof asaasEnv],
  } as unknown as ConfigService;
  const affiliatesService = {
    accruePaidPlanInvoice: jest.fn(),
    reverseInvoice: jest.fn(),
  };
  const service = new BillingService(
    configService,
    {
      findById: jest.fn().mockResolvedValue(buildTenant()),
      findByAsaasSubscriptionId: jest.fn().mockResolvedValue(null),
      findByAsaasCustomerId: jest.fn().mockResolvedValue(null),
      updateSubscriptionByTenantId: jest.fn().mockResolvedValue(buildTenant()),
      updateAsaasCustomerId: jest.fn(),
      updateSupportAiEntitlement: jest.fn(),
      ...tenants,
    } as TenantsService,
    { getClient: () => ({ from }) } as never,
    {} as AppointmentsService,
    affiliatesService as never,
    asaasClient as never,
  );

  return { service, affiliatesService, from };
}

describe('BillingService plan changes and period-end cancel', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-12-12T15:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps paid access until the period ends when the owner cancels', async () => {
    const updateSubscriptionByTenantId = jest
      .fn()
      .mockResolvedValue(buildTenant());
    const deleteSubscription = jest.fn().mockResolvedValue(undefined);
    const deletePayment = jest.fn().mockResolvedValue(undefined);
    const listPayments = jest.fn().mockResolvedValue({
      data: [
        { id: 'pay_future', status: 'PENDING', dueDate: '2026-12-27' },
        { id: 'pay_today', status: 'PENDING', dueDate: '2026-12-12' },
      ],
    });
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
        updateSubscriptionByTenantId,
      },
      { deleteSubscription, deletePayment, listPayments },
    );

    await service.cancelSubscription('tenant-1');

    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        subscriptionStatus: 'ACTIVE',
        subscriptionCancelAt: '2026-12-27T03:00:00.000Z',
      }),
    );
    expect(deletePayment).toHaveBeenCalledWith('pay_future');
    expect(deletePayment).not.toHaveBeenCalledWith('pay_today');
    expect(deleteSubscription).toHaveBeenCalledWith('sub_1');
    expect(updateSubscriptionByTenantId).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ planTier: 'SOLO' }),
    );
    expect(updateSubscriptionByTenantId).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ trialEndsAt: expect.anything() }),
    );
  });

  it('ignores the Asaas deletion webhook while cancellation is scheduled', async () => {
    const updateSubscriptionByTenantId = jest.fn();
    const { service } = buildService({
      findByAsaasSubscriptionId: jest.fn().mockResolvedValue(
        buildTenant({ subscription_cancel_at: '2026-12-27T03:00:00.000Z' }),
      ),
      updateSubscriptionByTenantId,
    });

    await service.processAsaasWebhookEvent({
      id: 'evt_del',
      event: 'SUBSCRIPTION_DELETED',
      subscription: { id: 'sub_1', customer: 'cus_1', value: 69.9 },
    });

    expect(updateSubscriptionByTenantId).not.toHaveBeenCalled();
  });

  it('expires a scheduled cancellation to PAST_DUE and keeps the plan', async () => {
    const tenant = buildTenant({
      subscription_cancel_at: '2026-12-01T03:00:00.000Z',
      subscription_expires_at: '2026-12-01T03:00:00.000Z',
    });
    const updateSubscriptionByTenantId = jest
      .fn()
      .mockResolvedValue(buildTenant({ subscription_status: 'PAST_DUE' }));
    const from = jest.fn(() =>
      createChainableQuery({ data: [tenant], error: null }),
    );
    const { service } = buildService(
      { updateSubscriptionByTenantId },
      {},
      from,
    );

    await service.markPastDueAfterGrace();

    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        subscriptionStatus: 'PAST_DUE',
        asaasSubscriptionId: null,
        subscriptionCancelAt: null,
      }),
    );
    expect(updateSubscriptionByTenantId).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ planTier: expect.anything() }),
    );
  });

  it('reactivates with the next charge on the current period end', async () => {
    const updateSubscriptionByTenantId = jest
      .fn()
      .mockResolvedValue(buildTenant());
    const createSubscription = jest.fn().mockResolvedValue({ id: 'sub_new' });
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({
            subscription_cancel_at: '2026-12-27T03:00:00.000Z',
          }),
        ),
        updateSubscriptionByTenantId,
      },
      { createSubscription },
    );

    await service.reactivateSubscription('tenant-1');

    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        value: 69.9,
        nextDueDate: '2026-12-27',
        externalReference: 'plan:tenant-1:PRO',
      }),
    );
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        asaasSubscriptionId: 'sub_new',
        subscriptionCancelAt: null,
        subscriptionStatus: 'ACTIVE',
      }),
    );
  });

  it('previews an upgrade difference and a Solo downgrade without an extra charge', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(buildTenant()),
    });

    const upgrade = await service.previewChangePlan('tenant-1', 'ELITE');
    const solo = await service.previewChangePlan('tenant-1', 'SOLO');

    expect(upgrade).toEqual(
      expect.objectContaining({
        direction: 'upgrade',
        proratedAmountBrl: 25.05,
        chargeAmountBrl: 25.05,
        belowAsaasMinimum: false,
        effectiveAt: null,
        appliesImmediately: false,
      }),
    );
    expect(solo).toEqual(
      expect.objectContaining({
        direction: 'downgrade',
        currentMonthlyValueBrl: 69.9,
        targetMonthlyValueBrl: 34.9,
        proratedAmountBrl: null,
        chargeAmountBrl: 0,
        effectiveAt: '2026-12-27T03:00:00.000Z',
        appliesImmediately: false,
      }),
    );
  });

  it('applies an upgrade immediately when the difference is below the Asaas minimum', async () => {
    const updateSubscription = jest.fn().mockResolvedValue({});
    const updateSubscriptionByTenantId = jest
      .fn()
      .mockResolvedValue(buildTenant({ plan_tier: 'PRO' }));
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({
            plan_tier: 'SOLO',
            subscription_expires_at: '2026-12-13T03:00:00.000Z',
          }),
        ),
        updateSubscriptionByTenantId,
      },
      { updateSubscription },
    );

    const result = await service.changePlan('tenant-1', 'PRO');

    expect(updateSubscription).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({ value: 69.9, updatePendingPayments: true }),
    );
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ planTier: 'PRO', pendingPlanTier: null }),
    );
    expect(result.applied).toBe(true);
    expect(result.chargeAmountBrl).toBe(0);
    expect(result.belowAsaasMinimum).toBe(true);
  });

  it('creates the prorated upgrade payment without changing the plan or accruing commission', async () => {
    const createPayment = jest.fn().mockResolvedValue({
      id: 'pay_up',
      invoiceUrl: 'https://asaas.com/i/up',
    });
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(
      buildTenant({
        pending_plan_tier: 'ELITE',
        pending_plan_payment_id: 'pay_up',
      }),
    );
    const { service, affiliatesService } = buildService(
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
        updateSubscriptionByTenantId,
      },
      { createPayment },
    );

    const result = await service.changePlan('tenant-1', 'ELITE');

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_1',
        billingType: 'UNDEFINED',
        value: 25.05,
        dueDate: '2026-12-12',
        description: 'Diferença de plano Pro para Elite',
        externalReference: 'plan-upgrade:tenant-1:ELITE',
      }),
    );
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        pendingPlanTier: 'ELITE',
        pendingPlanPaymentId: 'pay_up',
        pendingPlanInvoiceUrl: 'https://asaas.com/i/up',
      }),
    );
    expect(updateSubscriptionByTenantId).not.toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ planTier: 'ELITE' }),
    );
    expect(affiliatesService.accruePaidPlanInvoice).not.toHaveBeenCalled();
    expect(result.invoiceUrl).toBe('https://asaas.com/i/up');
    expect(result.applied).toBe(false);
  });

  it('applies the paid upgrade once and does not accrue affiliate commission', async () => {
    const updateSubscription = jest.fn().mockResolvedValue({});
    const updateSubscriptionByTenantId = jest
      .fn()
      .mockResolvedValue(buildTenant({ plan_tier: 'ELITE' }));
    const pending = buildTenant({
      pending_plan_tier: 'ELITE',
      pending_plan_payment_id: 'pay_up',
    });
    const findById = jest
      .fn()
      .mockResolvedValueOnce(pending)
      .mockResolvedValueOnce(
        buildTenant({
          plan_tier: 'ELITE',
          pending_plan_tier: null,
          pending_plan_payment_id: null,
        }),
      );
    const { service, affiliatesService } = buildService(
      { findById, updateSubscriptionByTenantId },
      { updateSubscription },
    );
    const event = {
      id: 'evt_up',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_up',
        value: 25.05,
        externalReference: 'plan-upgrade:tenant-1:ELITE',
      },
    };

    await service.processAsaasWebhookEvent(event);
    await service.processAsaasWebhookEvent(event);

    expect(updateSubscription).toHaveBeenCalledTimes(1);
    expect(updateSubscription).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        value: 120,
        externalReference: 'plan:tenant-1:ELITE',
        updatePendingPayments: true,
      }),
    );
    expect(updateSubscriptionByTenantId).toHaveBeenCalledTimes(1);
    expect(affiliatesService.accruePaidPlanInvoice).not.toHaveBeenCalled();
    expect(affiliatesService.reverseInvoice).not.toHaveBeenCalled();
  });

  it('clears a pending upgrade when the difference payment is deleted', async () => {
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(buildTenant());
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(
        buildTenant({
          pending_plan_tier: 'ELITE',
          pending_plan_payment_id: 'pay_up',
        }),
      ),
      updateSubscriptionByTenantId,
    });

    await service.processAsaasWebhookEvent({
      id: 'evt_over',
      event: 'PAYMENT_DELETED',
      payment: {
        id: 'pay_up',
        externalReference: 'plan-upgrade:tenant-1:ELITE',
      },
    });

    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        pendingPlanTier: null,
        pendingPlanPaymentId: null,
      }),
    );
  });

  it('schedules Solo as a downgrade and applies it on the next paid cycle', async () => {
    const updateSubscription = jest.fn().mockResolvedValue({});
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(
      buildTenant({
        pending_plan_tier: 'SOLO',
        pending_plan_effective_at: '2026-12-27T03:00:00.000Z',
      }),
    );
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
        updateSubscriptionByTenantId,
      },
      { updateSubscription },
    );

    const scheduled = await service.changePlan('tenant-1', 'SOLO');

    expect(updateSubscription).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        value: 34.9,
        externalReference: 'plan:tenant-1:SOLO',
      }),
    );
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        pendingPlanTier: 'SOLO',
        pendingPlanPaymentId: null,
        pendingPlanEffectiveAt: '2026-12-27T03:00:00.000Z',
      }),
    );
    expect(scheduled.applied).toBe(false);
    expect(scheduled.chargeAmountBrl).toBe(0);

    updateSubscriptionByTenantId.mockClear();
    const downgraded = buildTenant({
      pending_plan_tier: 'SOLO',
      pending_plan_effective_at: '2026-12-27T03:00:00.000Z',
    });
    const { service: renewal } = buildService({
      findById: jest.fn().mockResolvedValue(downgraded),
      findByAsaasCustomerId: jest.fn().mockResolvedValue(downgraded),
      updateSubscriptionByTenantId,
    });

    await renewal.processAsaasWebhookEvent({
      id: 'evt_cycle',
      event: 'PAYMENT_CONFIRMED',
      payment: {
        id: 'pay_cycle',
        customer: 'cus_1',
        subscription: 'sub_1',
        value: 34.9,
        dueDate: '2026-12-27',
        externalReference: 'plan:tenant-1:SOLO',
      },
    });

    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        planTier: 'SOLO',
        pendingPlanTier: null,
        subscriptionStatus: 'ACTIVE',
      }),
    );
  });

  it('offers Solo only while a higher paid plan can still be downgraded', async () => {
    const from = jest.fn((table: string) =>
      createChainableQuery(
        table === 'services'
          ? ({ data: null, error: null, count: 1 } as never)
          : { data: null, error: null },
      ),
    );
    const { service } = buildService(
      {
        findById: jest
          .fn()
          .mockResolvedValueOnce(buildTenant())
          .mockResolvedValueOnce(
            buildTenant({
              plan_tier: 'SOLO',
              pending_plan_tier: null,
            }),
          )
          .mockResolvedValueOnce(
            buildTenant({
              asaas_charges_enabled: false,
              asaas_wallet_id: null,
            }),
          ),
      },
      {},
      from,
    );

    const offer = await service.getBillingStatus('tenant-1');
    const solo = await service.getBillingStatus('tenant-1');
    const alert = await service.getBillingStatus('tenant-1');

    expect(offer.retentionOffer).toEqual({
      targetPlanTier: 'SOLO',
      monthlyValueBrl: 34.9,
      available: true,
      alreadyScheduled: false,
      effectiveAt: '2026-12-27T03:00:00.000Z',
    });
    expect(offer.canChargeDeposits).toBe(true);
    expect(offer.depositChargeAlert.active).toBe(false);
    expect(solo.retentionOffer.available).toBe(false);
    expect(alert.canChargeDeposits).toBe(false);
    expect(alert.depositChargeAlert.active).toBe(true);
    expect(alert.depositChargeAlert.message).toContain('sem sinal');
    expect(alert.depositChargeAlert.message).not.toMatch(/[—–]/);
  });

  it('rejects a plan change while cancellation is scheduled', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(
        buildTenant({ subscription_cancel_at: '2026-12-27T03:00:00.000Z' }),
      ),
    });

    await expect(service.changePlan('tenant-1', 'ELITE')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
