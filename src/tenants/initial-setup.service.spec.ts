import { NotFoundException } from '@nestjs/common';
import { InitialSetupService } from './initial-setup.service';
import { INITIAL_SETUP_CHECKLIST_VERSION } from './initial-setup.constants';
import type { Tenant } from './entities/tenant.entity';
import {
  createChainableQuery,
  createSupabaseServiceMock,
} from '../test-utils/supabase-mock';

function countQuery(count: number) {
  return createChainableQuery({
    data: null,
    error: null,
    count,
  } as never);
}

function readyTenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: 'tenant-1',
    plan_tier: 'SOLO',
    deposit_feature_enabled: false,
    logo_url: 'https://cdn.example/logo.png',
    banner_url: null,
    contact_phone: '11999999999',
    address_street: 'Rua A',
    address_city: 'Sao Paulo',
    initial_setup_settings_visited_at: '2026-01-01T00:00:00.000Z',
    initial_setup_customer_account_decided_at: '2026-01-01T00:00:00.000Z',
    reviews_enabled: true,
    stripe_connect_charges_enabled: false,
    subscription_status: 'ACTIVE',
    initial_setup_completed_at: null,
    initial_setup_version: null,
    ...overrides,
  } as Tenant;
}

describe('InitialSetupService', () => {
  it('rejects users without a tenant', async () => {
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue(null),
    };
    const service = new InitialSetupService({} as never, tenantsService as never);

    await expect(service.getStatusForUser('user-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('marks setup complete without requiring a test appointment', async () => {
    const queriedTables: string[] = [];
    const from = jest.fn((table: string) => {
      queriedTables.push(table);
      if (table === 'tenants') {
        return createChainableQuery({ data: null, error: null });
      }

      return countQuery(1);
    });

    const supabaseService = createSupabaseServiceMock({ from });
    const tenant = readyTenant();
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue({ tenant }),
    };
    const service = new InitialSetupService(
      supabaseService as never,
      tenantsService as never,
    );

    const status = await service.getStatusForUser('user-1');

    expect(status.isComplete).toBe(true);
    expect(status.hasExtraProfessional).toBe(false);
    expect(status.hasReviewedBusinessHours).toBe(false);
    expect(queriedTables).not.toContain('appointments');
    expect(from).toHaveBeenCalledWith('professionals');
    expect(from).toHaveBeenCalledWith('services');
    expect(from).toHaveBeenCalledWith('business_hours');
  });

  it('marks extra team only after a second professional exists', async () => {
    const from = jest.fn((table: string) => {
      if (table === 'professionals') {
        return countQuery(2);
      }
      if (table === 'tenants') {
        return createChainableQuery({ data: null, error: null });
      }
      return countQuery(1);
    });

    const supabaseService = createSupabaseServiceMock({ from });
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue({
        tenant: readyTenant(),
      }),
    };
    const service = new InitialSetupService(
      supabaseService as never,
      tenantsService as never,
    );

    const status = await service.getStatusForUser('user-1');

    expect(status.hasProfessional).toBe(true);
    expect(status.hasExtraProfessional).toBe(true);
  });

  it('marks hours as reviewed only after the admin saves them', async () => {
    const from = jest.fn((table: string) => {
      if (table === 'tenants') {
        return createChainableQuery({ data: null, error: null });
      }
      return countQuery(1);
    });

    const supabaseService = createSupabaseServiceMock({ from });
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue({
        tenant: readyTenant({
          initial_setup_hours_reviewed_at: '2026-01-02T00:00:00.000Z',
        }),
      }),
    };
    const service = new InitialSetupService(
      supabaseService as never,
      tenantsService as never,
    );

    const status = await service.getStatusForUser('user-1');

    expect(status.hasReviewedBusinessHours).toBe(true);
  });

  it('keeps growth items pending after essential setup is already persisted', async () => {
    const from = jest.fn((table: string) => {
      if (table === 'professionals') {
        return countQuery(1);
      }
      return countQuery(1);
    });

    const supabaseService = createSupabaseServiceMock({ from });
    const tenantsService = {
      findAccessContextByUserId: jest.fn().mockResolvedValue({
        tenant: readyTenant({
          initial_setup_completed_at: '2026-01-03T00:00:00.000Z',
          initial_setup_version: INITIAL_SETUP_CHECKLIST_VERSION,
          initial_setup_hours_reviewed_at: null,
        }),
      }),
    };
    const service = new InitialSetupService(
      supabaseService as never,
      tenantsService as never,
    );

    const status = await service.getStatusForUser('user-1');

    expect(status.isComplete).toBe(true);
    expect(status.isPersistedComplete).toBe(true);
    expect(status.hasExtraProfessional).toBe(false);
    expect(status.hasReviewedBusinessHours).toBe(false);
    expect(from).toHaveBeenCalledWith('professionals');
  });
});
