import { IsString, MinLength } from 'class-validator';

export class SignupTenantUserInviteDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}
