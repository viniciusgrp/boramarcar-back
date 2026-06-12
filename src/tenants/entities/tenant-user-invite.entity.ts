import type { UserRole } from './user-role.type';

export interface TenantUserInvite {
  id: string;
  tenant_id: string;
  email: string;
  role: UserRole;
  professional_id: string | null;
  token: string;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export interface TenantUserInvitePreview {
  email: string;
  role: UserRole;
  tenantName: string;
  expiresAt: string;
}
