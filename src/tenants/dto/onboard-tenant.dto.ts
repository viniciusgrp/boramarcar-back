import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class OnboardTenantDto {
  @IsString()
  @IsNotEmpty()
  owner_name!: string;

  @IsString()
  @IsNotEmpty()
  tenant_name!: string;

  @IsString()
  @IsNotEmpty()
  slug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  affiliate_code?: string;
}
