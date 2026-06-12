import type { UserRole } from '../entities/user-role.type';

export class UpdateTenantUserRoleDto {
  role!: UserRole;
  professionalId?: string | null;
}
