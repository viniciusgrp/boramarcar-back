import type { ConfigService } from '@nestjs/config';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import { createChainableQuery } from '../test-utils/supabase-mock';

function buildTenant(): Tenant {
  return {
    id: 'tenant-1',
    name: 'Studio',
    slug: 'studio',
    asaas_wallet_id: 'wal_1',
    asaas_charges_enabled: true,
    deposit_application_fee_percent: 5,
  } as Tenant;
}

describe('BillingService deposit lifecycle', () => {
  it('creates a Pix/card checkout with split to the subaccount wallet', async () => {
    const createCheckout = jest.fn().mockResolvedValue({
      link: 'https://asaas.com/c/1',
    });
    const service = new BillingService(
      {
        get: (key: string) =>
          ({
            APP_ENV: 'production',
            ASAAS_DEPOSIT_SUCCESS_URL: 'http://localhost/ok',
            ASAAS_DEPOSIT_CANCEL_URL: 'http://localhost/cancel',
            ASAAS_DEPOSIT_APPLICATION_FEE_PERCENT: '5',
          })[key],
      } as unknown as ConfigService,
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
      } as unknown as TenantsService,
      { getClient: () => ({ from: () => createChainableQuery({ data: null, error: null }) }) } as never,
      {} as never,
      {} as never,
      { createCheckout } as never,
    );

    const url = await service.createDepositCheckoutSession({
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      tenantName: 'Studio',
      tenantSlug: 'studio',
      depositAmountBrl: 50,
      accessToken: 'token',
      customerName: 'Ana',
      customerPhone: '11999999999',
    });

    expect(url).toBe('https://asaas.com/c/1');
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        billingTypes: ['PIX', 'CREDIT_CARD'],
        minutesToExpire: 30,
        externalReference: 'deposit:appt-1',
        splits: [{ walletId: 'wal_1', percentageValue: 95 }],
        items: [
          expect.objectContaining({
            imageBase64: expect.any(String),
            value: 50,
          }),
        ],
      }),
    );
  });

  it('refunds a late deposit payment', async () => {
    const refundPayment = jest.fn().mockResolvedValue({});
    const confirmDepositPaymentDetailed = jest.fn().mockResolvedValue({
      outcome: 'late_payment_needs_refund',
    });
    const markDepositRefunded = jest.fn();
    const service = new BillingService(
      { get: (key: string) => ({ APP_ENV: 'production' })[key] } as unknown as ConfigService,
      { findById: jest.fn() } as unknown as TenantsService,
      { getClient: () => ({ from: () => createChainableQuery({ data: null, error: null }) }) } as never,
      { confirmDepositPaymentDetailed, markDepositRefunded } as never,
      {} as never,
      { refundPayment } as never,
    );

    await service.processAsaasWebhookEvent({
      id: 'evt_dep',
      event: 'PAYMENT_RECEIVED',
      payment: {
        id: 'pay_dep',
        externalReference: 'deposit:appt-1',
      },
    });

    expect(refundPayment).toHaveBeenCalledWith('pay_dep');
    expect(markDepositRefunded).toHaveBeenCalledWith('appt-1');
  });
});
