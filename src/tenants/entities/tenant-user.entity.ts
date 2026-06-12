import type { UserRole } from './user-role.type';

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: UserRole;
  professional_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantUserListItem {
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  professionalId: string | null;
  professionalName: string | null;
}

export interface TenantMembershipSummary {
  id: string;
  role: UserRole;
  professionalId: string | null;
}
