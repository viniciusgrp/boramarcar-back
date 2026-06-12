import type { Tenant } from './tenant.entity';
import type { TenantMembershipSummary } from './tenant-user.entity';

export interface TenantMeResponse {
  tenant: Tenant;
  membership: TenantMembershipSummary;
}
