import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
  affiliate_code?: string;
}
