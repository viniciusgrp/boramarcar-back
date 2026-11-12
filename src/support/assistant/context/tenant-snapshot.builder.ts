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
    hasReviewsEnabled: boolean;
    hasAsaasAccount: boolean;
    requiresAsaasAccount: boolean;
    hasActiveSubscription: boolean;
    hasExtraProfessional: boolean;
    hasReviewedBusinessHours: boolean;
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
      hasReviewsEnabled: setup.hasReviewsEnabled,
      hasAsaasAccount: setup.hasAsaasAccount,
      requiresAsaasAccount: setup.requiresAsaasAccount,
      hasActiveSubscription: setup.hasActiveSubscription,
      hasExtraProfessional: setup.hasExtraProfessional,
      hasReviewedBusinessHours: setup.hasReviewedBusinessHours,
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
    'asaas_customer_id',
    'asaas_wallet',
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
