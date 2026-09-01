import type { User } from '@supabase/supabase-js';
import type { Request } from 'express';
import type { TenantAccessContext } from '../../tenants/entities/tenant-access-context.entity';
import type { PlatformAdmin } from '../../platform/entities/platform-admin.entity';
import type { Affiliate } from '../../affiliates/entities/affiliate.entity';

export interface AuthenticatedRequest extends Request {
  user?: User;
  tenantAccess?: TenantAccessContext;
  platformAdmin?: PlatformAdmin;
  affiliate?: Affiliate;
}
