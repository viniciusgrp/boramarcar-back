import type { UserRole } from './user-role.type';
import type { TenantUserPreferences } from './tenant-user-preferences.type';

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  role: UserRole;
  professional_id: string | null;
  preferences: TenantUserPreferences;
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
  preferences: import('./tenant-user-preferences.type').TenantUserPreferences;
}
