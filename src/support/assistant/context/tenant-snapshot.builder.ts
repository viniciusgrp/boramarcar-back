import type { InitialSetupStatus } from '../../../tenants/entities/initial-setup-status.entity';
import type { TenantAccessContext } from '../../../tenants/entities/tenant-access-context.entity';
import { USER_ROLE_LABELS } from '../../../tenants/entities/user-role.type';
import { hasTenantAdminAccess } from '../../../tenants/utils/tenant-access.util';

export interface SupportTenantSnapshot {
  tenantName: string;
  planTier: string;
  userRole: string;
  hasProductAccess: boolean;
  onboarding: {
    hasProfessional: boolean;
    hasService: boolean;
    hasBranding: boolean;
    hasBusinessHours: boolean;
    hasContactPhone: boolean;
    hasVisitedSettings: boolean;
    hasSharedBookingLink: boolean;
    hasCustomerAccountPolicy: boolean;
    hasStripeConnect: boolean;
    requiresStripeConnect: boolean;
    hasActiveSubscription: boolean;
    hasTestBooking: boolean;
    isComplete: boolean;
  };
}

export function buildSupportTenantSnapshot(
  context: TenantAccessContext,
  setup: InitialSetupStatus,
): SupportTenantSnapshot {
  return {
    tenantName: context.tenant.name,
    planTier: context.tenant.plan_tier,
    userRole: USER_ROLE_LABELS[context.tenantUser.role],
    hasProductAccess: hasTenantAdminAccess(context.tenant),
    onboarding: {
      hasProfessional: setup.hasProfessional,
      hasService: setup.hasService,
      hasBranding: setup.hasBranding,
      hasBusinessHours: setup.hasBusinessHours,
      hasContactPhone: setup.hasContactPhone,
      hasVisitedSettings: setup.hasVisitedSettings,
      hasSharedBookingLink: setup.hasSharedBookingLink,
      hasCustomerAccountPolicy: setup.hasCustomerAccountPolicy,
      hasStripeConnect: setup.hasStripeConnect,
      requiresStripeConnect: setup.requiresStripeConnect,
      hasActiveSubscription: setup.hasActiveSubscription,
      hasTestBooking: setup.hasTestBooking,
      isComplete: setup.isComplete,
    },
  };
}

export function serializeSupportTenantSnapshot(snapshot: SupportTenantSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

export function assertSupportTenantSnapshotHasNoForbiddenFields(
  snapshot: SupportTenantSnapshot,
): void {
  const serialized = JSON.stringify(snapshot);
  const forbiddenKeys = [
    'stripe_customer_id',
    'stripe_account',
    'contact_email',
    'customer_email',
    'password',
    'secret',
    'api_key',
  ];

  for (const key of forbiddenKeys) {
    if (serialized.toLowerCase().includes(key)) {
      throw new Error(`Snapshot contém campo proibido: ${key}`);
    }
  }
}
