import { IsString, MinLength } from 'class-validator';

export class AcceptTenantUserInviteDto {
  @IsString()
  @MinLength(1)
  token!: string;
}
