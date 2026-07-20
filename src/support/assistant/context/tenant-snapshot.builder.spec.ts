import {
  assertSupportTenantSnapshotHasNoForbiddenFields,
  buildSupportTenantSnapshot,
} from './tenant-snapshot.builder';
import type { InitialSetupStatus } from '../../../tenants/entities/initial-setup-status.entity';
import type { TenantAccessContext } from '../../../tenants/entities/tenant-access-context.entity';

const setup: InitialSetupStatus = {
  checklistVersion: 9,
  isComplete: false,
  isPersistedComplete: false,
  hasProfessional: true,
  hasService: false,
  hasBranding: true,
  hasBusinessHours: false,
  hasContactPhone: true,
  hasVisitedSettings: true,
  hasSharedBookingLink: false,
  hasCustomerAccountPolicy: true,
  hasReviewsEnabled: false,
  hasStripeConnect: false,
  requiresStripeConnect: false,
  hasActiveSubscription: true,
  hasTestBooking: false,
};

const context = {
  tenant: {
    id: 'tenant-1',
    name: 'Barbearia Z',
    plan_tier: 'PRO',
    subscription_status: 'ACTIVE',
    trial_ends_at: null,
    pre_subscription_trial_ends_at: null,
  },
  tenantUser: {
    id: 'tu-1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    role: 'OWNER',
    preferences: null,
  },
} as unknown as TenantAccessContext;

describe('tenant-snapshot.builder', () => {
  it('includes only allowlisted fields', () => {
    const snapshot = buildSupportTenantSnapshot(context, setup);
    expect(snapshot.tenantName).toBe('Barbearia Z');
    expect(snapshot.planTier).toBe('PRO');
    expect(snapshot.onboarding.hasProfessional).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('stripe_customer');
    expect(JSON.stringify(snapshot)).not.toContain('contact_email');
  });

  it('passes forbidden field assertion for allowlisted snapshot', () => {
    const snapshot = buildSupportTenantSnapshot(context, setup);
    expect(() => assertSupportTenantSnapshotHasNoForbiddenFields(snapshot)).not.toThrow();
  });
});
