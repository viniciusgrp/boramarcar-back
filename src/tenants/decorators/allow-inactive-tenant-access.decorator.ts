import { SetMetadata } from '@nestjs/common';

export const ALLOW_INACTIVE_TENANT_ACCESS_KEY = 'allowInactiveTenantAccess';

/**
 * Resolves the tenant access context (so RolesGuard still works) but skips the
 * active subscription / trial enforcement. Use on onboarding actions that must
 * remain available even when the trial expired and no plan is active yet.
 */
export const AllowInactiveTenantAccess = () =>
  SetMetadata(ALLOW_INACTIVE_TENANT_ACCESS_KEY, true);
