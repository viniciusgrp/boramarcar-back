import type { ConfigService } from '@nestjs/config';
import type { AppointmentsService } from '../appointments/appointments.service';
import type { SupabaseService } from '../supabase/supabase.service';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';

function buildTenant(overrides?: Partial<Tenant>): Tenant {
  return {
    id: 'tenant-1',
    name: 'Barbearia Teste',
    slug: 'barbearia-teste',
    subscription_status: 'NONE',
    plan_tier: 'SOLO',
    stripe_customer_id: 'cus_test_123',
    stripe_subscription_id: null,
    ...overrides,
  } as Tenant;
}

function buildService() {
  const configValues: Record<string, string> = {
    STRIPE_SECRET_KEY: 'sk_test_dummy',
    STRIPE_SOLO_PRICE_ID: 'price_solo_test',
    STRIPE_PRO_TIER_PRICE_ID: 'price_pro_test',
    STRIPE_ELITE_PRICE_ID: 'price_elite_test',
    STRIPE_BILLING_SUCCESS_URL: 'http://localhost:5173/admin/faturamento?success=true',
    STRIPE_BILLING_CANCEL_URL: 'http://localhost:5173/admin/faturamento?canceled=true',
  };

  const configService = {
    get: (key: string) => configValues[key],
  } as unknown as ConfigService;

  const tenantsService = {
    findById: jest.fn().mockResolvedValue(buildTenant()),
    updateStripeCustomerId: jest.fn(),
  } as unknown as TenantsService;

  const service = new BillingService(
    configService,
    tenantsService,
    {} as SupabaseService,
    {} as AppointmentsService,
  );

  return { service, tenantsService };
}

describe('BillingService createCheckoutSession promotion codes', () => {
  it('enables allow_promotion_codes on subscription checkout', async () => {
    const { service } = buildService();
    const createSessionMock = jest.fn().mockResolvedValue({
      url: 'https://checkout.stripe.com/c/pay/cs_test',
    });

    (
      service as unknown as {
        stripe: { checkout: { sessions: { create: typeof createSessionMock } } };
      }
    ).stripe.checkout.sessions.create = createSessionMock;

    const result = await service.createCheckoutSession({
      tenantId: 'tenant-1',
      tenantName: 'Barbearia Teste',
      ownerEmail: 'dono@example.com',
      planTier: 'SOLO',
    });

    expect(result).toEqual({ url: 'https://checkout.stripe.com/c/pay/cs_test' });
    expect(createSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        allow_promotion_codes: true,
        customer: 'cus_test_123',
      }),
    );
  });
});
