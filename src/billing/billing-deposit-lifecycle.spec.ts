import type { ConfigService } from '@nestjs/config';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import { createChainableQuery } from '../test-utils/supabase-mock';
import {
  ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH,
  ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH,
} from './utils/asaas-checkout-item.util';

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
            name: 'Sinal: Studio',
            description:
              'Pagamento antecipado para confirmar agendamento. Studio',
            imageBase64: expect.any(String),
            value: 50,
          }),
        ],
      }),
    );
  });

  it('keeps a long tenant name within the Asaas checkout item name limit', async () => {
    const tenantName = 'Teste Webhook2 Asaas HML';
    const createCheckout = jest
      .fn<
        Promise<{ link: string }>,
        [{ items: Array<{ name: string; description: string }> }]
      >()
      .mockResolvedValue({
        link: 'https://asaas.com/c/long',
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
      {
        getClient: () => ({
          from: () => createChainableQuery({ data: null, error: null }),
        }),
      } as never,
      {} as never,
      {} as never,
      { createCheckout } as never,
    );

    await service.createDepositCheckoutSession({
      appointmentId: 'appt-1',
      tenantId: 'tenant-1',
      tenantName,
      tenantSlug: 'studio',
      depositAmountBrl: 50,
      accessToken: 'token',
      customerName: 'Ana',
      customerPhone: '11999999999',
    });

    const item = createCheckout.mock.calls[0][0].items[0];

    expect(`Sinal: ${tenantName}`).toHaveLength(31);
    expect(item.name).toBe('Sinal: Teste Webhook2 Asaas HM');
    expect(item.name.length).toBeLessThanOrEqual(
      ASAAS_CHECKOUT_ITEM_NAME_MAX_LENGTH,
    );
    expect(item.description).toContain(tenantName);
    expect(item.description.length).toBeLessThanOrEqual(
      ASAAS_CHECKOUT_ITEM_DESCRIPTION_MAX_LENGTH,
    );
    expect(item.name).not.toMatch(/[–—]/);
    expect(item.description).not.toMatch(/[–—]/);
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

  it('confirms a deposit when the checkout is paid', async () => {
    const confirmDepositPaymentDetailed = jest.fn().mockResolvedValue({
      outcome: 'confirmed',
    });
    const service = new BillingService(
      { get: (key: string) => ({ APP_ENV: 'production' })[key] } as unknown as ConfigService,
      { findById: jest.fn() } as unknown as TenantsService,
      { getClient: () => ({ from: () => createChainableQuery({ data: null, error: null }) }) } as never,
      { confirmDepositPaymentDetailed } as never,
      {} as never,
      {} as never,
    );

    await service.processAsaasWebhookEvent({
      id: 'evt_checkout',
      event: 'CHECKOUT_PAID',
      checkout: {
        id: 'chk_1',
        externalReference: 'deposit:appt-1',
      },
    });

    expect(confirmDepositPaymentDetailed).toHaveBeenCalledWith('appt-1');
  });

  it('does not enable charges when only the documents are approved', async () => {
    const updateAsaasAccountStatus = jest.fn().mockResolvedValue(buildTenant());
    const service = new BillingService(
      { get: (key: string) => ({ APP_ENV: 'production' })[key] } as unknown as ConfigService,
      {
        findByAsaasAccountId: jest.fn().mockResolvedValue(buildTenant()),
        updateAsaasAccountStatus,
      } as unknown as TenantsService,
      { getClient: () => ({ from: () => createChainableQuery({ data: null, error: null }) }) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.processAsaasWebhookEvent({
      id: 'evt_docs',
      event: 'ACCOUNT_STATUS_DOCUMENT_APPROVED',
      account: {
        id: 'acc_1',
        accountStatus: { documentation: 'APPROVED', general: 'PENDING' },
      },
    });

    expect(updateAsaasAccountStatus).toHaveBeenCalledWith('tenant-1', {
      asaasDetailsSubmitted: true,
    });
  });

  it('enables charges only after general approval', async () => {
    const updateAsaasAccountStatus = jest.fn().mockResolvedValue(buildTenant());
    const service = new BillingService(
      { get: (key: string) => ({ APP_ENV: 'production' })[key] } as unknown as ConfigService,
      {
        findByAsaasAccountId: jest.fn().mockResolvedValue(buildTenant()),
        updateAsaasAccountStatus,
      } as unknown as TenantsService,
      { getClient: () => ({ from: () => createChainableQuery({ data: null, error: null }) }) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.processAsaasWebhookEvent({
      id: 'evt_general',
      event: 'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
      account: { id: 'acc_1' },
    });

    expect(updateAsaasAccountStatus).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ asaasChargesEnabled: true }),
    );
  });

  it('registers subaccount webhooks for account status only, on the platform email', async () => {
    const createAccount = jest.fn().mockResolvedValue({
      id: 'acc_1',
      walletId: 'wal_new',
    });
    const updateAsaasAccountStatus = jest.fn().mockResolvedValue(buildTenant());
    const service = new BillingService(
      {
        get: (key: string) =>
          ({
            APP_ENV: 'production',
            PUBLIC_API_ORIGIN: 'https://api.example.com',
            ASAAS_WEBHOOK_TOKEN: 'whsec',
            SUPPORT_EMAIL: 'ops@horariocerto.app',
            ASAAS_DEPOSIT_APPLICATION_FEE_PERCENT: '5',
            ASAAS_SUBACCOUNT_KEY_ENCRYPTION_KEY: 'test-subaccount-key',
          })[key],
      } as unknown as ConfigService,
      {
        findById: jest.fn().mockResolvedValue({
          ...buildTenant(),
          asaas_wallet_id: null,
        }),
        updateAsaasAccountStatus,
      } as unknown as TenantsService,
      { getClient: () => ({ from: () => createChainableQuery({ data: null, error: null }) }) } as never,
      {} as never,
      {} as never,
      { createAccount } as never,
    );

    await service.createAsaasAccount('tenant-1', {
      name: 'Studio',
      email: 'owner@shop.com',
      cpfCnpj: '12345678901',
      incomeValue: 5000,
      address: 'Rua A',
      addressNumber: '10',
      province: 'Centro',
      postalCode: '01001000',
      birthDate: '1990-05-15',
    });

    const webhook = createAccount.mock.calls[0][0].webhooks[0] as {
      email: string;
      events: string[];
    };

    expect(webhook.email).toBe('ops@horariocerto.app');
    expect(webhook.events).toEqual([
      'ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED',
      'ACCOUNT_STATUS_GENERAL_APPROVAL_REJECTED',
      'ACCOUNT_STATUS_DOCUMENT_APPROVED',
      'ACCOUNT_STATUS_DOCUMENT_REJECTED',
    ]);
  });
});
