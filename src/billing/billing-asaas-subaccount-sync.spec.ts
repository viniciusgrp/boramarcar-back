import type { ConfigService } from '@nestjs/config';
import type { Tenant } from '../tenants/entities/tenant.entity';
import type { TenantsService } from '../tenants/tenants.service';
import { BillingService } from './billing.service';
import { createChainableQuery } from '../test-utils/supabase-mock';
import {
  decryptAsaasSubaccountApiKey,
  encryptAsaasSubaccountApiKey,
} from './utils/asaas-subaccount-key.util';

const SECRET = 'test-subaccount-key';
const API_KEY = '$aact_test_subaccount_key';

function buildTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    name: 'Studio',
    slug: 'studio',
    asaas_account_id: 'acc_1',
    asaas_wallet_id: 'wal_1',
    asaas_charges_enabled: false,
    asaas_details_submitted: false,
    asaas_account_status: 'PENDING',
    ...overrides,
  } as Tenant;
}

function buildConfig(values: Record<string, string> = {}) {
  return {
    get: (key: string) =>
      ({
        APP_ENV: 'production',
        PUBLIC_API_ORIGIN: 'https://api.example.com',
        ASAAS_WEBHOOK_TOKEN: 'whsec',
        SUPPORT_EMAIL: 'ops@horariocerto.app',
        ASAAS_SUBACCOUNT_KEY_ENCRYPTION_KEY: SECRET,
        ...values,
      })[key],
  } as unknown as ConfigService;
}

describe('Asaas subaccount key and status sync', () => {
  it('stores the creation apiKey encrypted and never returns it', async () => {
    const createAccount = jest.fn().mockResolvedValue({
      id: 'acc_new',
      walletId: 'wal_new',
      apiKey: API_KEY,
    });
    const saveAsaasSubaccountApiKey = jest.fn().mockResolvedValue(undefined);
    const updated = buildTenant({
      asaas_account_id: 'acc_new',
      asaas_wallet_id: 'wal_new',
    });
    const service = new BillingService(
      buildConfig(),
      {
        findById: jest
          .fn()
          .mockResolvedValue(
            buildTenant({ asaas_account_id: null, asaas_wallet_id: null }),
          ),
        updateAsaasAccountStatus: jest.fn().mockResolvedValue(updated),
        saveAsaasSubaccountApiKey,
      } as unknown as TenantsService,
      {
        getClient: () => ({
          from: () => createChainableQuery({ data: null, error: null }),
        }),
      } as never,
      {} as never,
      {} as never,
      { createAccount } as never,
    );

    const status = await service.createAsaasAccount('tenant-1', {
      name: 'Studio',
      email: 'owner@shop.com',
      cpfCnpj: '12345678901',
      birthDate: '1990-01-01',
      incomeValue: 5000,
      address: 'Rua A',
      addressNumber: '10',
      province: 'Centro',
      postalCode: '01001000',
    });

    expect(saveAsaasSubaccountApiKey).toHaveBeenCalledTimes(1);
    const savedCalls = saveAsaasSubaccountApiKey.mock.calls as unknown as Array<
      [string, string]
    >;
    const ciphertext = savedCalls[0][1];
    expect(ciphertext.startsWith('enc:v1:')).toBe(true);
    expect(ciphertext).not.toContain(API_KEY);
    expect(decryptAsaasSubaccountApiKey(ciphertext, SECRET)).toBe(API_KEY);
    expect(JSON.stringify(status)).not.toContain(API_KEY);
    expect(status).not.toHaveProperty('apiKey');
  });

  it('syncs charges from myAccount/status when a subaccount key is stored', async () => {
    const ciphertext = encryptAsaasSubaccountApiKey(API_KEY, SECRET);
    const getMyAccountStatus = jest.fn().mockResolvedValue({
      general: 'APPROVED',
      commercialInfo: 'APPROVED',
      bankAccountInfo: 'APPROVED',
      documentation: 'PENDING',
    });
    const getAccount = jest.fn();
    const updateAsaasAccountStatus = jest
      .fn()
      .mockResolvedValue(buildTenant({ asaas_charges_enabled: true }));
    const service = new BillingService(
      buildConfig(),
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
        findAsaasSubaccountApiKeyCiphertext: jest
          .fn()
          .mockResolvedValue(ciphertext),
        updateAsaasAccountStatus,
      } as unknown as TenantsService,
      { getClient: () => ({ from: () => ({}) }) } as never,
      {} as never,
      {} as never,
      { getMyAccountStatus, getAccount } as never,
    );

    await service.syncAsaasAccount('tenant-1');

    expect(getAccount).not.toHaveBeenCalled();
    expect(getMyAccountStatus).toHaveBeenCalledWith(API_KEY);
    expect(updateAsaasAccountStatus).toHaveBeenCalledWith('tenant-1', {
      asaasChargesEnabled: true,
      asaasDetailsSubmitted: true,
      asaasAccountStatus: 'APPROVED',
    });
  });

  it('keeps local flags when myAccount status has no approval decision', async () => {
    const ciphertext = encryptAsaasSubaccountApiKey(API_KEY, SECRET);
    const getMyAccountStatus = jest.fn().mockResolvedValue({
      general: 'PENDING',
      commercialInfo: 'PENDING',
      bankAccountInfo: 'PENDING',
      documentation: 'PENDING',
    });
    const getAccount = jest.fn();
    const updateAsaasAccountStatus = jest.fn();
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const service = new BillingService(
      buildConfig(),
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
        findAsaasSubaccountApiKeyCiphertext: jest
          .fn()
          .mockResolvedValue(ciphertext),
        updateAsaasAccountStatus,
      } as unknown as TenantsService,
      { getClient: () => ({ from: () => ({}) }) } as never,
      {} as never,
      {} as never,
      { getMyAccountStatus, getAccount } as never,
    );
    const loggerWarn = jest
      .spyOn(
        (service as unknown as { logger: { warn: (message: string) => void } })
          .logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    const result = await service.syncAsaasAccount('tenant-1');

    expect(getAccount).not.toHaveBeenCalled();
    expect(updateAsaasAccountStatus).not.toHaveBeenCalled();
    expect(result?.asaas_charges_enabled).toBe(false);
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('returned no general status'),
    );
    loggerWarn.mockRestore();
    warn.mockRestore();
  });

  it('keeps the legacy accounts lookup when no subaccount key is stored', async () => {
    const getMyAccountStatus = jest.fn();
    const getAccount = jest.fn().mockResolvedValue({
      id: 'acc_1',
      accountStatus: {
        general: 'PENDING',
        documentation: 'APPROVED',
      },
    });
    const updateAsaasAccountStatus = jest
      .fn()
      .mockResolvedValue(buildTenant({ asaas_account_status: 'PENDING' }));
    const service = new BillingService(
      buildConfig(),
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
        findAsaasSubaccountApiKeyCiphertext: jest.fn().mockResolvedValue(null),
        updateAsaasAccountStatus,
      } as unknown as TenantsService,
      { getClient: () => ({ from: () => ({}) }) } as never,
      {} as never,
      {} as never,
      { getMyAccountStatus, getAccount } as never,
    );

    await service.syncAsaasAccount('tenant-1');

    expect(getMyAccountStatus).not.toHaveBeenCalled();
    expect(getAccount).toHaveBeenCalledWith('acc_1');
    expect(updateAsaasAccountStatus).toHaveBeenCalledWith('tenant-1', {
      asaasChargesEnabled: false,
      asaasDetailsSubmitted: true,
      asaasAccountStatus: 'PENDING',
    });
  });

  it('falls back to the legacy lookup when the stored key cannot be decrypted', async () => {
    const getMyAccountStatus = jest.fn();
    const getAccount = jest.fn().mockResolvedValue({
      id: 'acc_1',
      accountStatus: { general: 'APPROVED', documentation: 'APPROVED' },
    });
    const updateAsaasAccountStatus = jest.fn().mockResolvedValue(buildTenant());
    const service = new BillingService(
      buildConfig(),
      {
        findById: jest.fn().mockResolvedValue(buildTenant()),
        findAsaasSubaccountApiKeyCiphertext: jest
          .fn()
          .mockResolvedValue('enc:v1:not-a-real-payload'),
        updateAsaasAccountStatus,
      } as unknown as TenantsService,
      { getClient: () => ({ from: () => ({}) }) } as never,
      {} as never,
      {} as never,
      { getMyAccountStatus, getAccount } as never,
    );

    await service.syncAsaasAccount('tenant-1');

    expect(getMyAccountStatus).not.toHaveBeenCalled();
    expect(getAccount).toHaveBeenCalledWith('acc_1');
    expect(updateAsaasAccountStatus).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        asaasChargesEnabled: true,
        asaasAccountStatus: 'APPROVED',
      }),
    );
  });
});
