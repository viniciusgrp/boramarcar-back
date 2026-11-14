import { BadRequestException } from '@nestjs/common';
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
    asaas_wallet_id: null,
    asaas_charges_enabled: false,
  } as Tenant;
}

function buildService(createAccount: jest.Mock) {
  return new BillingService(
    {
      get: (key: string) =>
        ({
          APP_ENV: 'production',
          PUBLIC_API_ORIGIN: 'https://api.example.com',
          ASAAS_WEBHOOK_TOKEN: 'whsec',
          SUPPORT_EMAIL: 'ops@horariocerto.app',
          ASAAS_SUBACCOUNT_KEY_ENCRYPTION_KEY: 'test-subaccount-key',
        })[key],
    } as unknown as ConfigService,
    {
      findById: jest.fn().mockResolvedValue(buildTenant()),
      updateAsaasAccountStatus: jest.fn().mockResolvedValue(buildTenant()),
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
}

const basePayload = {
  name: 'Studio',
  email: 'owner@shop.com',
  incomeValue: 5000,
  address: 'Rua A',
  addressNumber: '10',
  province: 'Centro',
  postalCode: '01001-000',
};

describe('BillingService createAsaasAccount document fields', () => {
  it('rejects CPF without birthDate', async () => {
    const createAccount = jest.fn();
    const service = buildService(createAccount);

    await expect(
      service.createAsaasAccount('tenant-1', {
        ...basePayload,
        cpfCnpj: '123.456.789-01',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createAsaasAccount('tenant-1', {
        ...basePayload,
        cpfCnpj: '123.456.789-01',
      }),
    ).rejects.toThrow(/data de nascimento/);

    expect(createAccount).not.toHaveBeenCalled();
  });

  it('sends birthDate to Asaas for CPF and omits companyType', async () => {
    const createAccount = jest.fn().mockResolvedValue({
      id: 'acc_1',
      walletId: 'wal_new',
    });
    const service = buildService(createAccount);

    await service.createAsaasAccount('tenant-1', {
      ...basePayload,
      cpfCnpj: '123.456.789-01',
      birthDate: '1990-05-15',
      companyType: 'MEI',
    });

    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        cpfCnpj: '12345678901',
        birthDate: '1990-05-15',
      }),
    );
    expect(createAccount.mock.calls[0][0]).not.toHaveProperty('companyType');
  });

  it('rejects CNPJ without companyType', async () => {
    const createAccount = jest.fn();
    const service = buildService(createAccount);

    await expect(
      service.createAsaasAccount('tenant-1', {
        ...basePayload,
        cpfCnpj: '12.345.678/0001-90',
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createAsaasAccount('tenant-1', {
        ...basePayload,
        cpfCnpj: '12.345.678/0001-90',
      }),
    ).rejects.toThrow(/tipo de empresa/);

    expect(createAccount).not.toHaveBeenCalled();
  });

  it('sends companyType to Asaas for CNPJ and omits birthDate', async () => {
    const createAccount = jest.fn().mockResolvedValue({
      id: 'acc_1',
      walletId: 'wal_new',
    });
    const service = buildService(createAccount);

    await service.createAsaasAccount('tenant-1', {
      ...basePayload,
      cpfCnpj: '12.345.678/0001-90',
      companyType: 'LIMITED',
      birthDate: '1990-05-15',
    });

    expect(createAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        cpfCnpj: '12345678000190',
        companyType: 'LIMITED',
      }),
    );
    expect(createAccount.mock.calls[0][0]).not.toHaveProperty('birthDate');
  });
});
