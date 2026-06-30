import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterTenantDto {
  @IsString()
  @IsNotEmpty()
  owner_name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  @IsNotEmpty()
  tenant_name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;
}
