import type { UserRole } from '../entities/user-role.type';

export class CreateTenantUserInviteDto {
  email!: string;
  role!: UserRole;
  professionalId?: string | null;
}
