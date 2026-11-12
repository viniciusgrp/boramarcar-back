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
    plan_tier: 'SOLO',
    subscription_status: 'INACTIVE',
    asaas_customer_id: 'cus_1',
    asaas_subscription_id: null,
    asaas_pending_payment_id: null,
    asaas_wallet_id: 'wal_1',
    asaas_charges_enabled: true,
    asaas_details_submitted: true,
    deposit_application_fee_percent: 5,
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
  env: Record<string, string> = {},
  asaasClient: Record<string, unknown> = {},
) {
  const configService = {
    get: (key: string) => ({ ...asaasEnv, ...env })[key],
  } as unknown as ConfigService;

  const from = jest.fn(() => createChainableQuery({ data: null, error: null }));
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
      updateSubscriptionByTenantId: jest.fn(),
      ...tenants,
    } as TenantsService,
    { getClient: () => ({ from }) } as never,
    {} as AppointmentsService,
    affiliatesService as never,
    asaasClient as never,
  );

  return { service, affiliatesService, from, asaasClient };
}

describe('BillingService SaaS billing', () => {
  it('marks Asaas account as ready when charges are enabled', () => {
    const { service } = buildService();
    const status = service.buildAsaasAccountStatus(buildTenant());

    expect(status.isReady).toBe(true);
    expect(status.onboardingRequired).toBe(false);
  });

  it('requires onboarding when charges are off', () => {
    const { service } = buildService();
    const status = service.buildAsaasAccountStatus(
      buildTenant({ asaas_charges_enabled: false }),
    );

    expect(status.isReady).toBe(false);
    expect(status.onboardingRequired).toBe(true);
  });

  it('creates a subscription with UNDEFINED billing and stores the pending payment', async () => {
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(buildTenant());
    const asaasClient = {
      createSubscription: jest.fn().mockResolvedValue({
        id: 'sub_asaas',
        customer: 'cus_1',
      }),
      listPayments: jest.fn().mockResolvedValue({
        data: [{ id: 'pay_1', invoiceUrl: 'https://asaas.com/i/1' }],
      }),
    };
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({ trial_ends_at: '2026-12-01T00:00:00.000Z' }),
        ),
        updateSubscriptionByTenantId,
      },
      {},
      asaasClient,
    );

    const result = await service.createCheckoutSession({
      tenantId: 'tenant-1',
      tenantName: 'Studio',
      ownerEmail: 'owner@example.com',
      planTier: 'PRO',
    });

    expect(asaasClient.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        billingType: 'UNDEFINED',
        value: 69.9,
        nextDueDate: '2026-12-01',
        externalReference: 'plan:tenant-1:PRO',
      }),
    );
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        asaasSubscriptionId: 'sub_asaas',
        asaasPendingPaymentId: 'pay_1',
      }),
    );
    expect(result).toEqual({ url: 'https://asaas.com/i/1' });
  });

  it('sends updatePendingPayments when changing plan', async () => {
    const updateSubscription = jest.fn().mockResolvedValue({});
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(
      buildTenant({ asaas_subscription_id: 'sub_1', subscription_status: 'ACTIVE' }),
    );
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({ asaas_subscription_id: 'sub_1', subscription_status: 'ACTIVE' }),
        ),
        updateSubscriptionByTenantId,
      },
      {},
      { updateSubscription },
    );

    await service.changePlan('tenant-1', 'ELITE');

    expect(updateSubscription).toHaveBeenCalledWith(
      'sub_1',
      expect.objectContaining({
        value: 120,
        updatePendingPayments: true,
      }),
    );
  });

  it('cancels the Support AI subscription together with the plan', async () => {
    const deleteSubscription = jest.fn().mockResolvedValue(undefined);
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({
            asaas_subscription_id: 'sub_plan',
            support_ai_asaas_subscription_id: 'sub_ai',
            subscription_status: 'ACTIVE',
          }),
        ),
        updateSubscriptionByTenantId: jest.fn().mockResolvedValue(buildTenant()),
        updateSupportAiEntitlement: jest.fn().mockResolvedValue(buildTenant()),
      },
      {},
      { deleteSubscription },
    );

    await service.cancelSubscription('tenant-1');

    expect(deleteSubscription).toHaveBeenCalledWith('sub_ai');
    expect(deleteSubscription).toHaveBeenCalledWith('sub_plan');
  });

  it('activates the plan on PAYMENT_RECEIVED and accrues affiliate commission', async () => {
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(buildTenant());
    const { service, affiliatesService } = buildService({
      findById: jest.fn().mockResolvedValue(buildTenant({ trial_ends_at: '2026-12-01T00:00:00.000Z' })),
      updateSubscriptionByTenantId,
    });

    await service.processAsaasWebhookEvent({
      id: 'evt_1',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_1',
        customer: 'cus_1',
        subscription: 'sub_1',
        value: 69.9,
        externalReference: 'plan:tenant-1:PRO',
        invoiceUrl: 'https://asaas.com/i/1',
      },
    });

    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        subscriptionStatus: 'ACTIVE',
        planTier: 'PRO',
        asaasPendingPaymentId: null,
        trialEndsAt: null,
      }),
    );
    expect(affiliatesService.accruePaidPlanInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        providerPaymentId: 'pay_1',
        asaasCustomerId: 'cus_1',
      }),
    );
  });

  it('reverses affiliate commission on PAYMENT_REFUNDED', async () => {
    const { service, affiliatesService } = buildService();

    await service.processAsaasWebhookEvent({
      id: 'evt_2',
      event: 'PAYMENT_REFUNDED',
      payment: { id: 'pay_1', customer: 'cus_1' },
    });

    expect(affiliatesService.reverseInvoice).toHaveBeenCalledWith(
      'pay_1',
      'payment_refunded',
    );
  });

  it('blocks checkout when APP_ENV is not production', async () => {
    const { service } = buildService({}, { APP_ENV: 'development' });

    await expect(
      service.createCheckoutSession({
        tenantId: 'tenant-1',
        tenantName: 'Studio',
        ownerEmail: 'owner@example.com',
        planTier: 'SOLO',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
