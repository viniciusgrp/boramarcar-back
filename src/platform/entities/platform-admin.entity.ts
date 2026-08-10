import type { PlatformAdminRole } from './platform-admin-role.type';

export interface PlatformAdmin {
  id: string;
  user_id: string;
  role: PlatformAdminRole;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
