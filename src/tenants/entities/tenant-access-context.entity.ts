import type { Tenant } from './tenant.entity';
import type { TenantUser } from './tenant-user.entity';

export interface TenantAccessContext {
  tenant: Tenant;
  tenantUser: TenantUser;
}
