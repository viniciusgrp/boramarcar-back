import type { User } from '@supabase/supabase-js';
import type { Request } from 'express';
import type { TenantAccessContext } from '../../tenants/entities/tenant-access-context.entity';

export interface AuthenticatedRequest extends Request {
  user?: User;
  tenantAccess?: TenantAccessContext;
}
