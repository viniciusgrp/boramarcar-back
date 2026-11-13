import { BadRequestException } from '@nestjs/common';
import { AsaasHttpError } from '../asaas/asaas-http.error';
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
      updateAsaasCustomerId: jest.fn(),
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
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_new' }),
      createSubscription: jest.fn().mockResolvedValue({
        id: 'sub_asaas',
        customer: 'cus_new',
      }),
      listPayments: jest.fn().mockResolvedValue({
        data: [{ id: 'pay_1', invoiceUrl: 'https://asaas.com/i/1' }],
      }),
    };
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({
            trial_ends_at: '2026-12-01T00:00:00.000Z',
            asaas_customer_id: null,
          }),
        ),
        updateSubscriptionByTenantId,
        updateAsaasCustomerId: jest.fn(),
      },
      {},
      asaasClient,
    );

    const result = await service.createCheckoutSession({
      tenantId: 'tenant-1',
      tenantName: 'Studio',
      ownerEmail: 'owner@example.com',
      planTier: 'PRO',
      cpfCnpj: '123.456.789-01',
    });

    expect(asaasClient.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ cpfCnpj: '12345678901' }),
    );
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

  it('sets expiry one month after the paid charge, ignoring the next subscription due date', async () => {
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(buildTenant());
    const getSubscription = jest.fn().mockResolvedValue({
      id: 'sub_1',
      nextDueDate: '2027-01-01',
    });
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
        updateSubscriptionByTenantId,
      },
      {},
      { getSubscription },
    );

    await service.processAsaasWebhookEvent({
      id: 'evt_period',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_1',
        customer: 'cus_1',
        subscription: 'sub_1',
        value: 34.9,
        dueDate: '2026-11-01',
        externalReference: 'plan:tenant-1:SOLO',
      },
    });

    expect(getSubscription).not.toHaveBeenCalled();
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        subscriptionExpiresAt: '2026-12-01T00:00:00.000Z',
      }),
    );
  });

  it('does not move the expiry backward when an older charge is paid late', async () => {
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(buildTenant());
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(
        buildTenant({
          subscription_status: 'ACTIVE',
          asaas_subscription_id: 'sub_1',
          subscription_expires_at: '2026-12-01T00:00:00.000Z',
        }),
      ),
      updateSubscriptionByTenantId,
    });

    await service.processAsaasWebhookEvent({
      id: 'evt_late_old',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_old',
        customer: 'cus_1',
        subscription: 'sub_1',
        value: 34.9,
        dueDate: '2026-10-01',
        externalReference: 'plan:tenant-1:SOLO',
      },
    });

    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        subscriptionExpiresAt: '2026-12-01T00:00:00.000Z',
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

  it('reuses the pending trial invoice instead of creating another subscription', async () => {
    const createSubscription = jest.fn();
    const listPayments = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'pay_1',
          status: 'PENDING',
          invoiceUrl: 'https://asaas.com/i/pending',
        },
      ],
    });
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({
            asaas_subscription_id: 'sub_pending',
            asaas_open_invoice_url: 'https://asaas.com/i/pending',
            subscription_status: 'INACTIVE',
            plan_tier: 'PRO',
          }),
        ),
        updateSubscriptionByTenantId: jest.fn().mockResolvedValue(buildTenant()),
      },
      {},
      { createSubscription, listPayments },
    );

    const result = await service.createCheckoutSession({
      tenantId: 'tenant-1',
      tenantName: 'Studio',
      ownerEmail: 'owner@example.com',
      planTier: 'PRO',
    });

    expect(createSubscription).not.toHaveBeenCalled();
    expect(result).toEqual({ url: 'https://asaas.com/i/pending' });
  });

  it('returns the Asaas message when resuming a pending subscription fails', async () => {
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({
            asaas_subscription_id: 'sub_pending',
            subscription_status: 'INACTIVE',
            plan_tier: 'SOLO',
          }),
        ),
      },
      {},
      {
        updateSubscription: jest
          .fn()
          .mockRejectedValue(new AsaasHttpError(400, null, 'Cobrança já paga')),
      },
    );

    await expect(
      service.createCheckoutSession({
        tenantId: 'tenant-1',
        tenantName: 'Studio',
        ownerEmail: 'owner@example.com',
        planTier: 'PRO',
      }),
    ).rejects.toMatchObject({
      message: 'Cobrança já paga',
    });
  });

  it('does not replace the document of an existing Asaas customer', async () => {
    const updateCustomer = jest.fn();
    const asaasClient = {
      updateCustomer,
      createCustomer: jest.fn(),
      createSubscription: jest.fn().mockResolvedValue({
        id: 'sub_asaas',
        customer: 'cus_1',
      }),
      listPayments: jest.fn().mockResolvedValue({
        data: [{ id: 'pay_1', invoiceUrl: 'https://asaas.com/i/1' }],
      }),
    };
    const { service } = buildService({}, {}, asaasClient);

    await service.createCheckoutSession({
      tenantId: 'tenant-1',
      tenantName: 'Studio',
      ownerEmail: 'owner@example.com',
      planTier: 'SOLO',
      cpfCnpj: '12345678901',
    });

    expect(updateCustomer).not.toHaveBeenCalled();
    expect(asaasClient.createCustomer).not.toHaveBeenCalled();
    expect(asaasClient.createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_1' }),
    );
  });

  it('allows sandbox checkout when APP_ENV is not production', async () => {
    const asaasClient = {
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_new' }),
      createSubscription: jest.fn().mockResolvedValue({
        id: 'sub_asaas',
        customer: 'cus_new',
      }),
      listPayments: jest.fn().mockResolvedValue({
        data: [{ id: 'pay_1', invoiceUrl: 'https://sandbox.asaas.com/i/1' }],
      }),
    };
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({ asaas_customer_id: null }),
        ),
        updateSubscriptionByTenantId: jest.fn().mockResolvedValue(buildTenant()),
        updateAsaasCustomerId: jest.fn(),
      },
      {
        APP_ENV: 'hml',
        ASAAS_API_URL: 'https://api-sandbox.asaas.com/v3',
      },
      asaasClient,
    );

    await expect(
      service.createCheckoutSession({
        tenantId: 'tenant-1',
        tenantName: 'Studio',
        ownerEmail: 'owner@example.com',
        planTier: 'SOLO',
        cpfCnpj: '12345678901',
      }),
    ).resolves.toEqual({ url: 'https://sandbox.asaas.com/i/1' });
  });

  it('ignores a late payment for a canceled subscription', async () => {
    const updateSubscriptionByTenantId = jest.fn();
    const { service, affiliatesService } = buildService({
      findById: jest.fn().mockResolvedValue(
        buildTenant({
          subscription_status: 'CANCELED',
          asaas_subscription_id: null,
        }),
      ),
      updateSubscriptionByTenantId,
    });

    await service.processAsaasWebhookEvent({
      id: 'evt_late',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_old',
        customer: 'cus_1',
        subscription: 'sub_old',
        value: 69.9,
        externalReference: 'plan:tenant-1:PRO',
      },
    });

    expect(updateSubscriptionByTenantId).not.toHaveBeenCalled();
    expect(affiliatesService.accruePaidPlanInvoice).not.toHaveBeenCalled();
  });

  it('does not cancel the current plan when an older subscription is deleted', async () => {
    const updateSubscriptionByTenantId = jest.fn();
    const findByAsaasCustomerId = jest.fn();
    const { service } = buildService({
      findByAsaasSubscriptionId: jest.fn().mockResolvedValue(null),
      findByAsaasCustomerId,
      updateSubscriptionByTenantId,
    });

    await service.processAsaasWebhookEvent({
      id: 'evt_del',
      event: 'SUBSCRIPTION_DELETED',
      subscription: { id: 'sub_old', customer: 'cus_1', value: 34.9 },
    });

    expect(findByAsaasCustomerId).not.toHaveBeenCalled();
    expect(updateSubscriptionByTenantId).not.toHaveBeenCalled();
  });

  it('refuses to open an invoice that is already paid', async () => {
    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(buildTenant());
    const { service } = buildService(
      {
        findById: jest.fn().mockResolvedValue(
          buildTenant({
            asaas_subscription_id: 'sub_1',
            asaas_open_invoice_url: 'https://asaas.com/i/paid',
            subscription_status: 'ACTIVE',
          }),
        ),
        updateSubscriptionByTenantId,
      },
      {},
      {
        listPayments: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'pay_paid',
              status: 'RECEIVED',
              invoiceUrl: 'https://asaas.com/i/paid',
            },
          ],
        }),
      },
    );

    await expect(service.getOpenInvoiceUrl('tenant-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ asaasOpenInvoiceUrl: null }),
    );
  });

  it('turns the Support AI add-on off when its payment is refunded', async () => {
    const updateSupportAiEntitlement = jest.fn().mockResolvedValue(buildTenant());
    const { service } = buildService({
      updateSupportAiEntitlement,
    });

    await service.processAsaasWebhookEvent({
      id: 'evt_ai',
      event: 'PAYMENT_REFUNDED',
      payment: {
        id: 'pay_ai',
        customer: 'cus_1',
        externalReference: 'support-ai:tenant-1',
      },
    });

    expect(updateSupportAiEntitlement).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        supportAiEnabled: false,
        supportAiStatus: 'canceled',
      }),
    );
  });

  it('marks PAST_DUE when the latest charge due today is unpaid', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-12T12:00:00.000Z'));

    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(buildTenant());
    const listPayments = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'pay_next',
          status: 'PENDING',
          dueDate: '2026-12-01',
          invoiceUrl: 'https://asaas.com/i/next',
        },
        {
          id: 'pay_due',
          status: 'OVERDUE',
          dueDate: '2026-11-01',
          invoiceUrl: 'https://asaas.com/i/due',
        },
        {
          id: 'pay_old',
          status: 'RECEIVED',
          dueDate: '2026-10-01',
        },
      ],
    });
    const { service, from } = buildService(
      { updateSubscriptionByTenantId },
      {},
      { listPayments, getSubscription: jest.fn() },
    );

    from.mockImplementation(() =>
      createChainableQuery({
        data: [
          buildTenant({
            subscription_status: 'ACTIVE',
            asaas_subscription_id: 'sub_1',
            subscription_expires_at: '2026-10-01T00:00:00.000Z',
          }),
        ],
        error: null,
      }),
    );

    try {
      await service.markPastDueAfterGrace();
    } finally {
      jest.useRealTimers();
    }

    expect(listPayments).toHaveBeenCalledWith({
      subscription: 'sub_1',
      limit: 100,
    });
    expect(updateSubscriptionByTenantId).toHaveBeenCalledTimes(1);
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith('tenant-1', {
      subscriptionStatus: 'PAST_DUE',
    });
  });

  it('extends the local expiry when the latest due charge is already paid', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-11-12T12:00:00.000Z'));

    const updateSubscriptionByTenantId = jest.fn().mockResolvedValue(buildTenant());
    const listPayments = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'pay_next',
          status: 'PENDING',
          dueDate: '2026-12-01',
        },
        {
          id: 'pay_due',
          status: 'RECEIVED',
          dueDate: '2026-11-01',
        },
      ],
    });
    const { service, from } = buildService(
      { updateSubscriptionByTenantId },
      {},
      { listPayments },
    );

    from.mockImplementation(() =>
      createChainableQuery({
        data: [
          buildTenant({
            subscription_status: 'ACTIVE',
            asaas_subscription_id: 'sub_1',
            subscription_expires_at: '2026-10-01T00:00:00.000Z',
          }),
        ],
        error: null,
      }),
    );

    try {
      await service.markPastDueAfterGrace();
    } finally {
      jest.useRealTimers();
    }

    expect(updateSubscriptionByTenantId).toHaveBeenCalledTimes(1);
    expect(updateSubscriptionByTenantId).toHaveBeenCalledWith('tenant-1', {
      subscriptionStatus: 'ACTIVE',
      subscriptionExpiresAt: '2026-12-01T00:00:00.000Z',
    });
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
