import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import type { StripeEvent } from './types/stripe-api.types';
import { createChainableQuery } from '../test-utils/supabase-mock';

function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    name: 'Studio',
    slug: 'studio',
    plan_tier: 'SOLO',
    subscription_status: 'INACTIVE',
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_connect_account_id: 'acct_1',
    stripe_connect_charges_enabled: true,
    stripe_connect_details_submitted: true,
    deposit_application_fee_percent: 5,
    ...overrides,
  } as Tenant;
}

function buildService(tenants: Partial<TenantsService> = {}) {
  const configService = {
    get: (key: string) =>
      ({
        STRIPE_SECRET_KEY: 'sk_test_dummy',
        STRIPE_SOLO_PRICE_ID: 'price_solo',
        STRIPE_SUPPORT_AI_PRICE_ID: 'price_ai',
      })[key],
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
      ...tenants,
    } as TenantsService,
    { getClient: () => ({ from }) } as never,
    {} as AppointmentsService,
    affiliatesService as never,
  );

  return { service, affiliatesService, from };
}

describe('BillingService SaaS billing', () => {
  it('marks Connect as ready when charges are enabled', () => {
    const { service } = buildService();
    const status = service.buildStripeConnectStatus(buildTenant());

    expect(status.isReady).toBe(true);
    expect(status.onboardingRequired).toBe(false);
    expect(status.canOpenDashboard).toBe(true);
  });

  it('requires onboarding when Connect charges are off', () => {
    const { service } = buildService();
    const status = service.buildStripeConnectStatus(
      buildTenant({
        stripe_connect_account_id: 'acct_1',
        stripe_connect_charges_enabled: false,
      }),
    );

    expect(status.isReady).toBe(false);
    expect(status.onboardingRequired).toBe(true);
  });

  it('accrues affiliate commission on invoice.paid', async () => {
    const { service, affiliatesService } = buildService();
    const event = {
      id: 'evt_invoice',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_1',
          customer: 'cus_1',
          amount_paid: 5000,
          created: 1700000000,
          lines: { data: [{ amount: 5000, price: { id: 'price_solo' } }] },
        },
      },
    } as unknown as StripeEvent;

    await service.handleStripeWebhook(event);

    expect(affiliatesService.accruePaidPlanInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        stripeInvoiceId: 'in_1',
        stripeCustomerId: 'cus_1',
        amountPaid: 5000,
      }),
    );
  });

  it('reverses affiliate commission on charge.refunded', async () => {
    const { service, affiliatesService } = buildService();
    await service.handleStripeWebhook({
      id: 'evt_refund',
      type: 'charge.refunded',
      data: { object: { invoice: 'in_1' } },
    } as unknown as StripeEvent);

    expect(affiliatesService.reverseInvoice).toHaveBeenCalledWith(
      'in_1',
      'charge_refunded',
    );
  });

  it('cancels the tenant subscription on customer.subscription.deleted', async () => {
    const { service } = buildService();
    const syncSpy = jest
      .spyOn(
        service as never as {
          syncSubscriptionFromStripe: () => Promise<Tenant>;
        },
        'syncSubscriptionFromStripe',
      )
      .mockResolvedValue(buildTenant({ subscription_status: 'CANCELED' }));

    await service.handleStripeWebhook({
      id: 'evt_sub_del',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_1',
          customer: 'cus_1',
          status: 'canceled',
          current_period_end: 1700000000,
        },
      },
    } as unknown as StripeEvent);

    expect(syncSpy).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'sub_1' }),
      expect.objectContaining({
        subscriptionStatus: 'CANCELED',
        planTier: 'SOLO',
        applyPlanTierOnActive: false,
      }),
    );
  });

  it('refuses the billing portal without a Stripe customer', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(buildTenant({ stripe_customer_id: null })),
    });

    await expect(service.createCustomerPortalSession('tenant-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('blocks Support AI addon without an ACTIVE plan', async () => {
    const { service } = buildService();

    await expect(service.addSupportAiAddon('tenant-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when the tenant is missing', async () => {
    const { service } = buildService({
      findById: jest.fn().mockResolvedValue(null),
    });

    await expect(service.syncTenantSubscription('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
