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

export interface TenantUserInviteListItem {
  id: string;
  email: string;
  role: UserRole;
  professionalId: string | null;
  professionalName: string | null;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
}
