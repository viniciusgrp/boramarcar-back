import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { USER_ROLES, type UserRole } from '../entities/user-role.type';

export class CreateTenantUserInviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(USER_ROLES)
  role!: UserRole;

  @IsOptional()
  @IsUUID()
  professionalId?: string | null;
}
